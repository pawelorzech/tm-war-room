const TORN = "https://www.torn.com";

export const tornAttack = (id: number | string) => `${TORN}/page.php?sid=attack&user2ID=${id}`;
export const tornProfile = (id: number | string) => `${TORN}/profiles.php?XID=${id}`;
export const tornStats = (id: number | string) => `${TORN}/personalstats.php?ID=${id}`;
