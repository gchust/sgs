import { assetUrl } from './assets.js';
export const ROLE_NAMES = { lord: '主公', loyalist: '忠臣', rebel: '反贼', spy: '内奸' };
const extra = ['machao', 'huangyueying', 'simayi', 'xiahoudun', 'zhangliao', 'xuchu', 'guojia', 'zhenji', 'sunquan', 'ganning', 'lvmeng', 'huanggai', 'zhouyu', 'daqiao', 'luxun', 'huatuo', 'lvbu', 'xiahouyuan', 'caoren', 'huangzhong', 'weiyan', 'xiaoqiao', 'zhoutai', 'zhangjiao', 'yuji'];
export function portraitRegion(hero) {
    if (hero.pack === '拓') return { src: assetUrl('assets/portraits-expansion.png'), width: 1536, height: 1024, box: [(hero.art % 3) * 512, Math.floor(hero.art / 3) * 512, 512, 512] };
    const i = extra.indexOf(hero.id);
    if (i < 0) {
        const xs = [0, 313, 627, 940, 1254], ys = [0, 628, 1254], x = hero.art % 4, y = Math.floor(hero.art / 4);
        const faceTop = [95, 100, 130, 105, 120, 135, 170, 130][hero.art];
        return { src: assetUrl('assets/portraits.png'), box: [xs[x] + 2, ys[y] + faceTop, xs[x + 1] - xs[x] - 4, 350] };
    }
    const xs = [0, 251, 502, 753, 1004, 1254], ys = [0, 251, 502, 753, 983, 1254], x = i % 5, y = Math.floor(i / 5);
    return { src: assetUrl('assets/portraits-extra.png'), box: [xs[x] + 2, ys[y] + 2, xs[x + 1] - xs[x] - 4, ys[y + 1] - ys[y] - 4] };
}
export const SEATS = {
    2: [[50, 24]],
    3: [[28, 25], [72, 25]],
    4: [[11, 61], [50, 23], [89, 61]],
    5: [[11, 61], [32, 23], [68, 23], [89, 61]],
    6: [[9, 63], [25, 24], [50, 21], [75, 24], [91, 63]],
    7: [[8, 63], [23, 24], [41, 20], [59, 20], [77, 24], [92, 63]],
};
export const PHASES = ['准备', '判定', '摸牌', '出牌', '弃牌', '结束'];
