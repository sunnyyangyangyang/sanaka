const fs = require('fs');
const path = require('path');

function tokenizeUserArgs(input) {
  const tokens = [];
  const source = String(input || '').trim();
  if (!source) {
    return tokens;
  }

  let current = '';
  let quote = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '\\' && index + 1 < source.length) {
        index += 1;
        current += source[index];
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function guestFamily(guestArch) {
  if (guestArch === 'x86_64' || guestArch === 'i386') {
    return 'x86';
  }
  if (guestArch === 'aarch64' || guestArch === 'arm') {
    return 'arm';
  }
  if (guestArch === 'ppc' || guestArch === 'ppc64') {
    return 'ppc';
  }
  return guestArch;
}

function hostFamily(hostArch) {
  if (hostArch === 'x64' || hostArch === 'ia32') {
    return 'x86';
  }
  if (hostArch === 'arm64' || hostArch === 'arm') {
    return 'arm';
  }
  return hostArch;
}

function resolveBinaryKey(machineArch) {
  if (machineArch === 'x86_64') return 'x86_64';
  if (machineArch === 'i386') return 'i386';
  if (machineArch === 'aarch64') return 'aarch64';
  if (machineArch === 'arm') return 'arm';
  return machineArch;
}

function chooseAccelerator(requested, platform, guestArch, hostArch, availableAccelerators) {
  const platformDefault = platform === 'darwin' ? 'hvf' : platform === 'linux' ? 'kvm' : platform === 'win32' ? 'whpx' : 'tcg';
  const familyMatches = guestFamily(guestArch) === hostFamily(hostArch);

  if (requested) {
    return requested;
  }

  if (!familyMatches) {
    return 'tcg';
  }

  return availableAccelerators.includes(platformDefault) ? platformDefault : 'tcg';
}

function mapBootOrder(bootOrder) {
  if (bootOrder === 'cdrom') return 'd';
  if (bootOrder === 'disk') return 'c';
  if (bootOrder === 'floppy') return 'a';
  return null;
}

function mapAudioDevice(machine, audioBackend, hostPlatform) {
  const soundCard = machine.system?.sound_card || 'intel-hda';
  const resolvedBackend =
    !audioBackend || audioBackend === 'auto'
      ? (hostPlatform === 'darwin'
        ? 'coreaudio'
        : hostPlatform === 'win32'
          ? 'directsound'
          : 'none')
      : audioBackend;

  if (resolvedBackend === 'none' || resolvedBackend === 'spice') {
    if (soundCard === 'intel-hda') {
      return ['-device', 'intel-hda', '-device', 'hda-duplex'];
    }
    if (soundCard === 'ac97') {
      return ['-device', 'AC97'];
    }
    if (soundCard === 'sb16') {
      return ['-device', 'sb16'];
    }
    if (soundCard === 'virtio-sound-pci') {
      return ['-device', 'virtio-sound-pci'];
    }
    return [];
  }

  const audiodevType =
    resolvedBackend === 'coreaudio' ? 'coreaudio'
      : resolvedBackend === 'pulseaudio' ? 'pa'
        : resolvedBackend === 'pipewire' ? 'pipewire'
          : resolvedBackend === 'directsound' ? 'dsound'
            : null;

  if (!audiodevType) {
    return [];
  }

  if (soundCard === 'intel-hda') {
    return ['-audiodev', `${audiodevType},id=audio0`, '-device', 'intel-hda', '-device', 'hda-duplex,audiodev=audio0'];
  }

  if (soundCard === 'ac97') {
    return ['-audiodev', `${audiodevType},id=audio0`, '-device', 'AC97,audiodev=audio0'];
  }

  if (soundCard === 'virtio-sound-pci') {
    return ['-audiodev', `${audiodevType},id=audio0`, '-device', 'virtio-sound-pci,audiodev=audio0'];
  }

  if (soundCard === 'sb16') {
    return ['-audiodev', `${audiodevType},id=audio0`, '-device', 'sb16,audiodev=audio0'];
  }

  return [];
}

function buildDisplayArgs(machineArch, gpu) {
  if (guestFamily(machineArch) === 'arm') {
    return ['-device', 'virtio-gpu-pci'];
  }

  if (gpu === 'virtio-vga') return ['-vga', 'none', '-device', 'virtio-vga'];
  if (gpu === 'cirrus-vga') return ['-vga', 'cirrus'];
  if (gpu === 'vmware-svga') return ['-vga', 'vmware'];
  if (gpu === 'qxl') return ['-vga', 'qxl'];
  if (gpu === 'std' || gpu === 'VGA') return ['-vga', 'std'];
  return ['-vga', 'std'];
}

function defaultMachineType(machineArch) {
  if (machineArch === 'aarch64' || machineArch === 'arm') {
    return 'virt';
  }
  if (machineArch === 'x86_64' || machineArch === 'i386') {
    return 'q35';
  }
  return '';
}

function isX86MachineType(machineType) {
  return machineType === 'q35' || machineType === 'pc' || machineType.startsWith('pc-');
}

function ensureFile(filePath) {
  return typeof filePath === 'string' && filePath.length > 0 && fs.existsSync(filePath);
}

function resolveQemuShareDir(binaryPath) {
  const candidates = [
    path.resolve(path.dirname(binaryPath), '../share/qemu'),
    path.resolve(path.dirname(binaryPath), 'share'),
    path.resolve(path.dirname(binaryPath), '../share'),
    '/usr/share/qemu',
    '/usr/local/share/qemu',
    '/opt/homebrew/share/qemu'
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function resolveUefiFirmware(binaryPath, machineType, guestArch, runtimeDir) {
  if (guestArch !== 'x86_64' && guestArch !== 'i386') {
    throw new Error(`UEFI is not supported yet for ${guestArch} machines.`);
  }

  if (!isX86MachineType(machineType)) {
    throw new Error(`UEFI requires a PC-compatible machine type. Current machine type: ${machineType}.`);
  }

  const shareDir = resolveQemuShareDir(binaryPath);
  if (!shareDir) {
    throw new Error('UEFI firmware was not found. Install QEMU firmware files before enabling UEFI.');
  }

  const codePath = guestArch === 'x86_64'
    ? path.join(shareDir, 'edk2-x86_64-code.fd')
    : path.join(shareDir, 'edk2-i386-code.fd');
  const varsTemplatePath = path.join(shareDir, 'edk2-i386-vars.fd');

  if (!ensureFile(codePath) || !ensureFile(varsTemplatePath)) {
    throw new Error('UEFI firmware was not found. Install QEMU firmware files before enabling UEFI.');
  }

  const varsPath = path.join(runtimeDir, `uefi-${guestArch}-vars.fd`);
  if (!fs.existsSync(varsPath)) {
    fs.copyFileSync(varsTemplatePath, varsPath);
  }

  return {
    codePath,
    varsPath
  };
}

class QemuCommandBuilder {
  build({ machine, environment, runtimePaths, displayConfig, host }) {
    const guestArch = machine.system.arch;
    const binaryKey = resolveBinaryKey(guestArch);
    const binary = environment.binaries[binaryKey];

    if (!binary?.found || !binary.path) {
      throw new Error(`QEMU binary for ${guestArch} is not available.`);
    }

    const accelerator = chooseAccelerator(
      machine.system.accelerator,
      host.platform,
      guestArch,
      host.arch,
      environment.accelerators
    );

    const displayFrontend = 'sanaka';
    const displayBackend = 'vnc';
    const args = ['-name', machine.title, '-display', 'none'];
    const machineType = machine.system?.machine_type || defaultMachineType(guestArch);

    if (machineType) {
      args.push('-machine', machineType);
    }

    args.push('-accel', accelerator !== 'tcg' ? accelerator : 'tcg');

    args.push('-m', String(machine.system?.memory_mib || 2048));
    args.push('-smp', String(machine.system?.cpu_cores || 2));

    const bootOrder = mapBootOrder(machine.system.boot_order);
    if (bootOrder) {
      args.push('-boot', `order=${bootOrder}`);
    }

    const qmpAddress =
      runtimePaths.qmp.transport === 'unix'
        ? `unix:${runtimePaths.qmp.path},server=on,wait=off`
        : `tcp:${runtimePaths.qmp.host}:${runtimePaths.qmp.port},server=on,wait=off`;
    args.push('-qmp', qmpAddress);

    if (machine.system?.uefi) {
      const firmware = resolveUefiFirmware(binary.path, machineType, guestArch, runtimePaths.runtimeDir);
      args.push('-drive', `if=pflash,format=raw,readonly=on,file=${firmware.codePath}`);
      args.push('-drive', `if=pflash,format=raw,file=${firmware.varsPath}`);
    }

    args.push(...buildDisplayArgs(guestArch, machine.display.gpu));

    args.push('-drive', `if=none,id=cd0,media=cdrom,readonly=on,file=${machine.media?.iso || ''}`);
    args.push('-device', 'ide-cd,drive=cd0');

    if (machine.media?.floppy) {
      args.push('-drive', `if=none,id=floppy0,media=disk,format=raw,file=${machine.media.floppy}`);
      args.push('-device', 'floppy,drive=floppy0');
    }

    let needsScsiController = false;
    let needsSataController = false;
    for (const disk of machine.disks || []) {
      if (disk.interface === 'scsi') {
        needsScsiController = true;
      }
      if (disk.interface === 'sata') {
        needsSataController = true;
      }
    }

    if (needsScsiController) {
      args.push('-device', 'virtio-scsi-pci,id=scsi0');
    }

    if (needsSataController) {
      args.push('-device', 'ich9-ahci,id=ahci0');
    }

    (machine.disks || []).forEach((disk, index) => {
      const driveId = `drive${index}`;
      const driveArgs = [`file=${disk.path}`, `format=${disk.format || 'qcow2'}`, `id=${driveId}`, 'if=none'];
      if (disk.readonly) {
        driveArgs.push('readonly=on');
      }
      args.push('-drive', driveArgs.join(','));

      if (disk.interface === 'ide') {
        args.push('-device', `ide-hd,drive=${driveId}`);
      } else if (disk.interface === 'scsi') {
        args.push('-device', `scsi-hd,drive=${driveId},bus=scsi0.0`);
      } else if (disk.interface === 'sata') {
        args.push('-device', `ide-hd,drive=${driveId},bus=ahci0.${index}`);
      } else {
        args.push('-device', `virtio-blk-pci,drive=${driveId}`);
      }
    });

    if (machine.network?.enabled) {
      if (machine.network.mode === 'bridge' && host.platform !== 'linux') {
        throw new Error('Bridge networking is only supported in the first runtime version on Linux hosts.');
      }

      const netdev =
        machine.network.mode === 'bridge'
          ? 'bridge,id=net0'
          : 'user,id=net0';
      args.push('-netdev', netdev, '-device', `${machine.network.card},netdev=net0`);
    }

    if (machine.peripherals?.usb_tablet) {
      args.push('-usb', '-device', 'usb-tablet');
    }

    args.push(...mapAudioDevice(machine, machine.advanced?.audio_backend, host.platform));

    args.push(
      '-vnc',
      `127.0.0.1:${displayConfig.displayNumber},websocket=${displayConfig.websocketPort}`
    );

    const userArgs = tokenizeUserArgs(machine.advanced?.qemu_args || '');
    args.push(...userArgs);

    return {
      binaryPath: binary.path,
      args,
      accelerator,
      display: {
        frontend: displayFrontend,
        backend: displayBackend,
        port: displayBackend === 'vnc' ? displayConfig.port : displayConfig.port,
        websocketPort: displayBackend === 'vnc' ? displayConfig.websocketPort : undefined
      }
    };
  }
}

module.exports = {
  QemuCommandBuilder,
  chooseAccelerator,
  resolveBinaryKey,
  tokenizeUserArgs,
  buildDisplayArgs,
  resolveUefiFirmware
};
