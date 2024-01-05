
import { Context } from 'koishi'

declare module 'koishi' {
    interface Tables {
        ba_jp_total: baJPTotal
    }
}
export interface baJPTotal {
    season: number//赛季
    boss_name: string
    boss_type: string//类型
    time: string//时间
}
export module DB {
    export async function initTotalTable(ctx: Context) {
        if (ctx.model.tables.ba_jp_total === undefined) {
            ctx.model.extend('ba_jp_total', {
                season: { type: 'integer' },
                boss_name: { type: 'string' },
                boss_type: { type: 'string' },
                time: { type: 'string' },
            }, { primary: 'season' })
        }
    }
}
export const mapper = {
    "大蛇·薇娜": ["大蛇"],
    "白＆黑": ["黑白"],
    "球球·赫赛德": ["球"],
    "主教": ["寿司"],
    "佩洛洛斯拉": ["鸡"],
    "HOD": ["霍德"],
    "GOZ": ["GOZ"],
    "GREGORIUS": ["格里高利"],
    "若藻&amp;气垫船": ["气垫船"],
    "猫鬼·黑影": ["猫鬼"],
}