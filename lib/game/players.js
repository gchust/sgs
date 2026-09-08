// A national-war general grants skills only after that general is revealed.
export const hasHero = (player, id) => !!player && (player.generals
    ? player.generals.some((hero, index) => player.revealed[index] && hero.id === id)
    : player.hero.id === id);
export const visibleGenerals = player => player.generals
    ? player.generals.filter((_, index) => player.revealed[index]) : [player.hero];
export const playerName = player => !player ? '' : player.generals
    ? visibleGenerals(player).map(hero => hero.name).join('·') || `第${player.id + 1}席`
    : player.hero.name;
export const playerFemale = player => visibleGenerals(player)[0]?.female ?? null;
export const teamName = team => !team ? '未亮将' : team.startsWith('wild:') ? '野心家' : `${team}势力`;
