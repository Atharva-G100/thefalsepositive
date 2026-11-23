export interface MusicTrack {
  title: string;
  youtubeId: string;
  artist?: string;
  channel?: string;
}

// Add YouTube video IDs here. No account, API key, or downloaded audio is required.
export const musicTracks: MusicTrack[] = [
  {
    title: 'Wind (Instrumental)',
    artist: 'Akeboshi',
    youtubeId: 'jIrFOvKYWoI',
    channel: 'Red Will productions',
  },
  {
    title: 'Jacob and the Stone',
    artist: 'Emile Mosseri',
    youtubeId: 'mbm3Llu2114',
  },
  {
    title: 'eye-water',
    youtubeId: 'YbJpH9to-9Y',
  },
  {
    title: 'Call of Silence (Instrumental)',
    artist: 'Hiroyuki Sawano · Gemie',
    youtubeId: 'twcvAJcirfo',
  },
];
