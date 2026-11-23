import { getImage } from 'astro:assets';
import emblem from '../assets/valak-emblem.png';
import type { Config } from './types/config';
const profileImage = await getImage({ src: emblem, width: 128, height: 128, format: 'png' });

const config: Config = {
  title: 'The False Positive',
  author: 'vaLak',
  avatar: profileImage.src,
  description: 'Cybersecurity learner & researcher · Red teamer',
  theme: 'nayuta',
  postsPerPage: 10,
  links: [
    { text: 'Home', url: '/', icon: { type: 'icon', name: 'fa-solid fa-house' } },
    { text: 'Blog', url: '/blog', icon: { type: 'icon', name: 'fa-solid fa-pen' } },
    { text: 'Writeups', url: '/ctf', icon: { type: 'icon', name: 'fa-solid fa-file-lines' } },
    { text: 'Toolkit', url: '/arsenal', icon: { type: 'icon', name: 'fa-solid fa-toolbox' } },
    { text: 'News', url: '/news', icon: { type: 'icon', name: 'fa-solid fa-newspaper' } },
    { text: 'About', url: '/about', icon: { type: 'icon', name: 'fa-solid fa-user' } },
    { url: 'https://github.com/Atharva-G100', ariaLabel: 'GitHub', icon: { type: 'icon', name: 'fa-brands fa-github' } },
    { url: 'https://www.linkedin.com/in/atharva-gawas-valak/', ariaLabel: 'LinkedIn', icon: { type: 'icon', name: 'fa-brands fa-linkedin' } },
    { url: 'mailto:gawasatharva8@gmail.com', ariaLabel: 'Email', icon: { type: 'icon', name: 'fa-solid fa-envelope' } },
  ],
};
export default config;
