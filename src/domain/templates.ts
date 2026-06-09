import type { SakaMachine, SakaTemplate, TemplateCatalogEntry } from './schemas';

const now = () => new Date().toISOString();

function generateMachineId() {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `machine-${globalThis.crypto.randomUUID()}`;
  }
  return `machine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeTemplateLabel(template: { key: string; label: string }) {
  if (template.key === 'win11' && template.label === 'Windows 10/11') {
    return {
      ...template,
      label: 'Windows 10'
    };
  }
  return template;
}

export function normalizeMachineCompatibility(machine: SakaMachine): SakaMachine {
  const normalizedGpu = machine.display.gpu === 'VGA' ? 'std' : machine.display.gpu;
  const normalizedMachineType =
    machine.system.machine_type === 'pc'
      ? 'pc-i440fx-9.2'
      : machine.system.machine_type === 'q35'
        ? 'pc-q35-9.2'
        : machine.system.machine_type;
  return {
    ...machine,
    template: normalizeTemplateLabel(machine.template),
    system: {
      ...machine.system,
      machine_type: normalizedMachineType,
      uefi: machine.system.uefi ?? false
    },
    display: {
      ...machine.display,
      frontend: 'sanaka',
      gpu: normalizedGpu,
      sanaka: machine.display.sanaka
        ? {
            ...machine.display.sanaka,
            backend: 'vnc'
          }
        : {
            backend: 'vnc',
            scale_mode: 'fit',
            clipboard: true
          }
    }
  };
}

function makeBaseMachine(id: string, title: string): Omit<SakaMachine, 'template' | 'system' | 'network' | 'display' | 'peripherals'> {
  return {
    format_version: 1,
    kind: 'machine',
    id,
    title,
    author: '',
    description: '',
    created_with: 'Sanaka 0.1',
    created_at: now(),
    updated_at: now(),
    meta: {
      notes: '',
      tags: []
    },
    media: {
      iso: '',
      floppy: ''
    },
    sharing: {
      enabled: false,
      hostPath: '',
      mode: 'readwrite',
      shareName: 'qemu'
    },
    integration: {
      clipboard: {
        enabled: true,
        mode: 'text',
        autoConnect: true
      }
    },
    disks: [],
    advanced: {
      audio_backend: 'auto',
      qemu_args: '',
      firmware: {
        code_path: '',
        vars_path: ''
      }
    }
  };
}

export const builtInTemplates: SakaTemplate[] = [
  {
    format_version: 1,
    kind: 'template',
    id: 'template-win98',
    title: 'Windows 98 Template',
    description: 'Legacy compatibility machine for Windows 98 workloads.',
    template: { key: 'win98', label: 'Windows 98' },
    system: { arch: 'i386', machine_type: 'pc-i440fx-9.2', accelerator: 'tcg', boot_order: 'cdrom', uefi: false, memory_mib: 128, cpu_cores: 1, sound_card: 'sb16' },
    media: { iso: '', floppy: '' },
    network: { enabled: true, mode: 'user', card: 'pcnet' },
    sharing: { enabled: false, hostPath: '', mode: 'readwrite', shareName: 'qemu' },
    integration: { clipboard: { enabled: true, mode: 'text', autoConnect: true } },
    display: {
      frontend: 'sanaka',
      gpu: 'cirrus-vga',
      sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true },
      spice: { address: '127.0.0.1', port: 5930, clipboard: true, audio: true },
      vnc: { address: '127.0.0.1', port: 5901, password: '' }
    },
    peripherals: { usb_tablet: true },
    advanced: { audio_backend: 'auto', qemu_args: '' }
  },
  {
    format_version: 1,
    kind: 'template',
    id: 'template-winxp',
    title: 'Windows XP Template',
    description: 'Compatibility-first machine for Windows XP workloads.',
    template: { key: 'winxp', label: 'Windows XP' },
    system: { arch: 'i386', machine_type: 'pc-i440fx-9.2', accelerator: 'tcg', boot_order: 'cdrom', uefi: false, memory_mib: 512, cpu_cores: 1, sound_card: 'ac97' },
    media: { iso: '', floppy: '' },
    network: { enabled: true, mode: 'user', card: 'rtl8139' },
    sharing: { enabled: false, hostPath: '', mode: 'readwrite', shareName: 'qemu' },
    integration: { clipboard: { enabled: true, mode: 'text', autoConnect: true } },
    display: {
      frontend: 'sanaka',
      gpu: 'std',
      sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true },
      spice: { address: '127.0.0.1', port: 5930, clipboard: true, audio: true },
      vnc: { address: '127.0.0.1', port: 5901, password: '' }
    },
    peripherals: { usb_tablet: true },
    advanced: { audio_backend: 'auto', qemu_args: '' }
  },
  {
    format_version: 1,
    kind: 'template',
    id: 'template-win11',
    title: 'Windows 10 Template',
    description: 'Compatibility-first modern Windows machine.',
    template: { key: 'win11', label: 'Windows 10' },
    system: { arch: 'x86_64', machine_type: 'pc-q35-9.2', accelerator: 'tcg', boot_order: 'cdrom', uefi: false, memory_mib: 4096, cpu_cores: 2, sound_card: 'intel-hda' },
    media: { iso: '', floppy: '' },
    network: { enabled: true, mode: 'user', card: 'rtl8139' },
    sharing: { enabled: false, hostPath: '', mode: 'readwrite', shareName: 'qemu' },
    integration: { clipboard: { enabled: true, mode: 'text', autoConnect: true } },
    display: {
      frontend: 'sanaka',
      gpu: 'std',
      sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true },
      spice: { address: '127.0.0.1', port: 5930, clipboard: true, audio: true },
      vnc: { address: '127.0.0.1', port: 5901, password: '' }
    },
    peripherals: { usb_tablet: true },
    advanced: { audio_backend: 'auto', qemu_args: '' }
  },
  {
    format_version: 1,
    kind: 'template',
    id: 'template-linux',
    title: 'Linux Generic Template',
    description: 'Compatibility-first Linux template with architecture-aware defaults.',
    template: { key: 'linux', label: 'Linux Generic' },
    system: { arch: 'x86_64', machine_type: 'pc-q35-9.2', accelerator: 'tcg', boot_order: 'cdrom', uefi: false, memory_mib: 2048, cpu_cores: 2, sound_card: 'intel-hda' },
    media: { iso: '', floppy: '' },
    network: { enabled: true, mode: 'user', card: 'e1000' },
    sharing: { enabled: false, hostPath: '', mode: 'readwrite', shareName: 'qemu' },
    integration: { clipboard: { enabled: true, mode: 'text', autoConnect: true } },
    display: {
      frontend: 'sanaka',
      gpu: 'std',
      sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true },
      spice: { address: '127.0.0.1', port: 5930, clipboard: true, audio: true },
      vnc: { address: '127.0.0.1', port: 5901, password: '' }
    },
    peripherals: { usb_tablet: true },
    advanced: { audio_backend: 'auto', qemu_args: '' }
  },
  {
    format_version: 1,
    kind: 'template',
    id: 'template-custom',
    title: 'Custom Template',
    description: 'Manual machine template for advanced workflows.',
    template: { key: 'custom', label: 'Custom' },
    system: { arch: 'none', machine_type: 'none', accelerator: 'none', boot_order: 'none', uefi: false, memory_mib: 2048, cpu_cores: 2, sound_card: 'none' },
    media: { iso: '', floppy: '' },
    network: { enabled: false, mode: 'user', card: 'none' },
    sharing: { enabled: false, hostPath: '', mode: 'readwrite', shareName: 'qemu' },
    integration: { clipboard: { enabled: true, mode: 'text', autoConnect: true } },
    display: {
      frontend: 'sanaka',
      gpu: 'none',
      sanaka: { backend: 'vnc', scale_mode: 'fit', clipboard: true },
      spice: { address: '127.0.0.1', port: 5930, clipboard: true, audio: true },
      vnc: { address: '127.0.0.1', port: 5901, password: '' }
    },
    peripherals: { usb_tablet: true },
    advanced: { audio_backend: 'auto', qemu_args: '' }
  }
];

export const defaultTemplateCatalog: TemplateCatalogEntry[] = builtInTemplates.map((template, index) => ({
  key: template.template.key,
  label: template.template.label,
  source: 'builtin',
  enabled: true,
  order: index,
  defaultFrontend: template.display.frontend
}));

export function findBuiltInTemplate(key: string) {
  return builtInTemplates.find((template) => template.template.key === key) ?? builtInTemplates[3];
}

export function createMachineFromTemplate(templateKey: string): SakaMachine {
  const template = findBuiltInTemplate(templateKey);
  return createMachineFromTemplateDocument(template);
}

export function createMachineFromTemplateDocument(template: SakaTemplate): SakaMachine {
  const normalizedTemplate = normalizeTemplateLabel(template.template);
  const title = normalizedTemplate.label === 'Custom' ? 'Custom Machine' : normalizedTemplate.label;

  return normalizeMachineCompatibility({
    ...makeBaseMachine(generateMachineId(), title),
    template: { ...normalizedTemplate },
    system: { ...template.system, uefi: template.system.uefi ?? false },
    network: { ...template.network },
    sharing: template.sharing
      ? { ...template.sharing }
      : { enabled: false, hostPath: '', mode: 'readwrite', shareName: 'qemu' },
    integration: template.integration
      ? {
          clipboard: {
            enabled: template.integration.clipboard?.enabled ?? true,
            mode: template.integration.clipboard?.mode ?? 'text',
            autoConnect: template.integration.clipboard?.autoConnect ?? true
          }
        }
      : { clipboard: { enabled: true, mode: 'text', autoConnect: true } },
    display: {
      ...template.display,
      frontend: 'sanaka',
      sanaka: template.display.sanaka ? { ...template.display.sanaka } : undefined,
      spice: template.display.spice ? { ...template.display.spice } : undefined,
      vnc: template.display.vnc ? { ...template.display.vnc } : undefined
    },
    peripherals: { ...template.peripherals }
  });
}
