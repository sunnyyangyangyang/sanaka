import React from 'react';
import { GitHubIcon, BilibiliIcon, TikTokIcon } from './icons';

interface SocialIconsProps {
  onIconClick: (url: string) => void;
}

const socialLinks = [
  {
    name: 'GitHub',
    url: 'https://github.com/steve372a/sanaka',
    Icon: GitHubIcon,
  },
  {
    name: 'Bilibili',
    url: 'https://space.bilibili.com/430970352',
    Icon: BilibiliIcon,
  },
  {
    name: 'TikTok',
    url: 'https://www.douyin.com/user/MS4wLjABAAAA9qPzmphnYdp2_g0ePrHY3whKslc2gFFErKDgY1lzaoo?from_tab_name=main&vid=7459945209556782396',
    Icon: TikTokIcon,
  },
];

export const SocialIcons: React.FC<SocialIconsProps> = ({ onIconClick }) => {
  return (
    <div className="social-icons">
      {socialLinks.map(({ name, url, Icon }) => (
        <button
          className="social-icons__button"
          key={name}
          onClick={() => onIconClick(url)}
          title={name}
        >
          <Icon size={32} />
        </button>
      ))}
    </div>
  );
};
