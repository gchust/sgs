import { visibleGenerals } from './players.js';

// Only a revealed general may identify a national-war skill's speaker.
// Resolve the skill owner, not merely the main general (the deputy may own it).
export function voiceChoices(word, player, characters, narration) {
    const owner = player && visibleGenerals(player).find(hero => characters[hero.id]?.skills[word]);
    return owner ? characters[owner.id].skills[word] : narration[word] ? [narration[word]] : [];
}
