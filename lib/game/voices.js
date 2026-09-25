import { playerFemale, visibleGenerals } from './players.js';

// Only a revealed general may identify a national-war skill's speaker.
// Resolve the skill owner, not merely the main general (the deputy may own it).
export function voiceChoices(word, player, characters, narration) {
    const owner = player && visibleGenerals(player).find(hero => characters[hero.id]?.skills[word]);
    if (owner) return characters[owner.id].skills[word];
    // Hidden generals use the neutral default; never infer sex from their identity.
    const card = narration[word];
    const clip = card?.[player && playerFemale(player) ? 'female' : 'male'];
    return clip ? [clip] : [];
}
