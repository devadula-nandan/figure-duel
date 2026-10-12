// Board geometry shared by the game and the storybook: field points on a 7 x 5 grid, the routes between them, and the bench / P.C. spots.
const XY = {}; for (let i = 0; i < 7; i++) { XY[i] = [i, 0]; XY[21 + i] = [i, 4]; }
Object.assign(XY, { 7: [0, 1], 12: [0, 2], 16: [0, 3], 11: [6, 1], 15: [6, 2], 20: [6, 3], 8: [1.5, 1], 9: [3, 1], 10: [4.5, 1], 13: [1.5, 2], 14: [4.5, 2], 17: [1.5, 3], 18: [3, 3], 19: [4.5, 3] });
const EDGES = [[0, 1], [0, 7], [0, 8], [1, 2], [2, 3], [2, 9], [3, 4], [4, 5], [5, 6], [6, 10], [6, 11], [7, 12], [8, 9], [8, 13], [9, 10], [10, 14], [11, 15], [12, 16], [13, 17], [14, 19], [15, 20], [16, 21], [17, 18], [17, 21], [18, 19], [18, 25], [19, 27], [20, 27], [21, 22], [22, 23], [23, 24], [24, 25], [25, 26], [26, 27]];
// Bench and P.C. spots (table units: x across, z towards the bottom player); the far side is the same turned around. They keep the
// original table's arrangement (two staggered bench rows of three, two P.C. spots beside them) on one even grid: five columns 1.45 apart in
// the front row, the bench taking the first three and the P.C. the last two, so the inner P.C. spot sits where a fourth front-row bench
// spot would; the back row is offset by half a column. The outermost rings end just inside the entry points' rings.
const SPOT = { 28: [2.9, 4.77], 29: [1.45, 4.77], 30: [0, 4.77], 31: [2.175, 5.65], 32: [.725, 5.65], 33: [-.725, 5.65], 40: [-1.45, 4.77], 41: [-2.9, 4.77] };
for (let i = 0; i < 6; i++) SPOT[34 + i] = SPOT[28 + i].map(v => -v); SPOT[42] = [1.45, -4.77]; SPOT[43] = [2.9, -4.77];
