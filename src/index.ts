import { Context, Schema, h } from 'koishi'
import xCrawl from 'x-crawl'
import fs from 'fs'
import path from 'path'
import { DB, mapper } from './data'
import { Canvas } from 'koishi-plugin-skia-canvas'

export const name = 'ba-raid'
export const usage = '## 感谢以下数据源：\n- [AronaAi](https://arona.ai/graph/)：提供了47期往后的总力统计信息\n- [bawiki](https://ba.gamekee.com/)：提供了总力概览信息\n' +
  '### 注意事项：\n- 使用图形化输出：Linux服务器的bot可能出现图形中文乱码的现象，请自行安装微软雅黑字体。\n' +
  '### 功能和指令：\n - 功能：分数线，最高分，通关人数，排名或分数互查(仅二档内)，查看boss上场次数。\n' +
  '- 指令：zlcx bosscx rankcx，详情请自行help\n' +
  '### 反馈及建议：\n- 请发送邮件至eruru.sion@gmail.com'

export interface Config {
  'toPhoto': boolean
}

export const Config: Schema<Config> = Schema.object({
  'toPhoto': Schema.boolean().default(true).description('图形化渲染'),
})
export const inject = {
  required: ['canvas', 'database'],
}
export function apply(ctx: Context, config: Config) {
  const myXCrawl = xCrawl({ timeout: 10000, intervalTime: { max: 2000, min: 1000 }, maxRetry: 3 })
  const totalPath = path.join(ctx.baseDir, 'cache', 'total')
  let dispo = true
  ctx.on('ready', async () => {
    fs.mkdirSync(totalPath, { recursive: true })
    await DB.initTotalTable(ctx)
    //await getRecord(ctx)
    //await autoCrawl()
  })
  ctx.on('dispose', () => {
    dispo = false
  })
  ctx.command('zlcx', '获取总力数据(47期往后)。').alias('总力查询').example('zlcx 60')
    .usage("可选参数：期数\n快捷查询：\n总力人数查询(zlcx -l)\n总力最高分查询(zlcx -t)")
    .option('l', '查询难度通关人数').shortcut("总力人数查询", { options: { l: true } })
    .option('t', '查询难度最高分').shortcut("总力最高分查询", { options: { t: true } })
    .action(async ({ session, options }, ...args) => {
      try {
        let data
        let res = args.length === 0 ? await ctx.database.select('ba_jp_total').orderBy('season', 'desc').limit(1).execute() : await ctx.database.get('ba_jp_total', { season: parseInt(args[0]) })
        if (options.t) {
          data = await queryTotal(res[0], 3)
        } else if (options.l) {
          data = await queryTotal(res[0], 2)
        } else {
          data = await queryTotal(res[0], 1)
        }
        if (config.toPhoto) {
          data = h.image(toPng(data))
        }
        await session.send(data)
      } catch (error) {
        session.send("查无此期数据")
      }
    })
  ctx.command('bosscx', '查询指定总力boss登场记录').alias('总力boss查询').example('bosscx 大蛇').usage('必选参数：boss名字')
    .action(async ({ session }, ...args) => {
      let bossName = args[0]
      for (const key in mapper) {
        if (mapper[key].includes(args[0])) {
          bossName = key
          break
        }
      }
      try {
        let resultData
        let res = await ctx.database.get('ba_jp_total', { boss_name: bossName })
        let data = await queryTotal(res[res.length - 1], 1)
        resultData = `${res[0].boss_name}共出现：${res.length}期\n最近一期：第${res[res.length - 1].season}期\n${data}`
        if (config.toPhoto) {
          resultData = h.image(toPng(resultData))
        }
        await session.send(resultData)
      } catch (error) {
        session.send("查无此Boss")
      }
    })
  ctx.command('rankcx', '功能1：根据分数查询排名\n功能2：根据排名查询分数').alias('总力排名查询')
    .usage('可选参数：期数\n必选参数：排名或分数\n查询范围：只提供二档以内的查询\n快捷查询：\n总力排名查询(rankcx)\n总力分数查询(rankcx -s)').example('rankcx 60 27654545')
    .option('s', '根据排名查询分数').shortcut("总力分数查询", { options: { s: true } }).example('rankcx 期数 分数/排名')
    .action(async ({ session, options }, ...args) => {
      if (args.length === 0) return options.s ? "输入你要查询的分数" : "输入你要查询的排名"
      try {
        //分数和排名查询
        let query = options.s ? 4 : 5
        let score = args.length === 1 ? parseInt(args[0]) : parseInt(args[1])
        if (Number.isNaN(score)) {
          return '输入异常'
        }let data
        //默认查询和选期查询
        let res = args.length === 1 ? await ctx.database.select('ba_jp_total').orderBy('season', 'desc').limit(1).execute() : await ctx.database.get('ba_jp_total', { season: parseInt(args[0]) })
        data = await queryTotal(res[0], query, score)
        if (config.toPhoto) {
          data = h.image(toPng(data))
        }
        await session.send(data)
      } catch (error) {
        session.send("查无此期数据")
      }
    })
  /** 自动数据获取 */
  async function autoCrawl() {
    while (dispo) {
      let nextTime = await getData()
      console.log("距离下次Crawl还有：" + nextTime / 3600000 + "小时。")
      await new Promise(resolve => setTimeout(resolve, nextTime))
    }
  }
  /** 获取总力分数记录数据*/
  async function getData() {
    let N = 47//arona只保留了47期(TM)往后的数据
    let time
    while (true) {
      if (fs.existsSync(path.join(totalPath, `Total${N}Data.json`))) {
        N++
        continue
      } else {
        let apiUrl = `https://blue.triple-lab.com/raid/${N}`
        let res = await myXCrawl.crawlData({ targets: [apiUrl] })
        let resultData = res[0].data
        if (!res[0].isSuccess || res[0].data.statusCode === 404) {
          N--
          apiUrl = `https://blue.triple-lab.com/raid/${N}`
          res = await myXCrawl.crawlData({ targets: [apiUrl] })
          resultData = res[0].data
          try {
            time = 1800000
            let data = await fs.promises.readFile(path.join(totalPath, `Total${N}Data.json`), 'utf8')
            let localData = JSON.parse(data)
            if (localData.data.e[0] !== resultData.data.e[0]) saveData(resultData, N)
          } catch (err) {
            console.error(err)
          }
          return time
        }
        console.log("data from:" + apiUrl)
        saveData(resultData, N)
        N++
      }
    }
  }
  /** 获取总力记录信息*/
  async function getRecord(ctx: Context) {
    let res = await myXCrawl.crawlHTML(['https://ba.gamekee.com/584839.html']).then((res) => { return res[0].data.html })
    let tbody = /<tbody[\s\S]*<\/tbody>/.exec(res)[0]//获取<tbody >标签
    let trreg = tbody.match(/<tr[\s\S]*?<\/tr>/g).reverse()//获取<tr >标签
    trreg.forEach((tr, index) => {
      if (trreg.length - 1 === index) return
      let div = tr.match(/<div(?:(?!<span)[\s\S])*?<\/div>/g).map(divs => /<div(?:[^<]*?)>([\s\S]*?)<\/div>/.exec(divs)[1])//获取排除拥有<span>标签的<div标签>
      if (div.length !== 4) ctx.database.upsert('ba_jp_total', [{ season: index - 1, boss_name: div[0], boss_type: div[1], time: div[2] }])
      else ctx.database.upsert('ba_jp_total', [{ season: index - 1, boss_name: div[1], boss_type: div[2], time: div[3] }])
    })
  }
  /** 数据保存
   *  参数：
   *  resultData:待保存json数据
   *  N:计数器，记录期数
   */
  async function saveData(resultData, N) {
    renameKeys(resultData.data)
    try {
      fs.writeFileSync(path.join(totalPath, `Total${N}Data.json`), JSON.stringify(resultData, null, 2))
    } catch (err) {
      console.error('保存文件时出错:', err)
    }
  }
  /** 修改键名
   *  data:数据源
   */
  function renameKeys(data) {
    const keyMap = {
      a: 'army',
      b: 'benchmark',
      t: 'top',
      l: 'liberator',
      r: 'rank',
      s: 'silver',
      g: 'gold',
      p: 'platinum'
    }
    for (const oldKey in keyMap) {
      const newKey = keyMap[oldKey]
      data[newKey] = data[oldKey]
      delete data[oldKey]
    }
    data.army.forEach(a => {
      a.score = a.s
      delete a.s
      a.team = a.t
      delete a.t
      a.team.forEach(t => {
        t.striker = t.m
        delete t.m
        t.special = t.s
        delete t.s
      })
    })
  }
  /** 数据查询
   *  参数列表：
   *  raid: 查询期数信息
   *  query: 查询类型判断
   *  socre：待查询信息(可选)
   */
  async function queryTotal(raid, query, score = 0) {
    try {
      let jsonData = fs.readFileSync(path.join(totalPath, `Total${raid.season}Data.json`), 'utf-8')
      let data = await JSON.parse(jsonData).data
      const lastTime = new Date(data.e[0] + data.e[2])
      const season = `第${raid.season}期总力统计\nboss：${raid.boss_name}\n类型：${raid.boss_type}\n`
      const lastUP = "数据来源：https://arona.ai/graph\n最后更新时间：" + lastTime.toLocaleString().trim()
      switch (query) {
        case 1:
          return season + queryBenchmark(data.benchmark) + lastUP
        case 2:
          return season + queryLiberator(data.liberator) + lastUP
        case 3:
          return season + queryTop(data.top) + lastUP
        case 4:
          return season + queryRank(data.rank, score, true) + lastUP
        case 5:
          return season + queryRank(data.rank, score, false) + lastUP
      }
    } catch (error) {
      return `第${raid.season}期总力战\nboss：${raid.boss_name}\n类型：${raid.boss_type}\n暂未统计`
    }
  }
  /** 分数线查询
   *  参数列表：
   *  data：数据源
   */
  function queryBenchmark(data) {
    let resultString = ''
    for (const key in data) {
      if (Object.hasOwnProperty.call(data, key)) {
        const value = data[key]
        resultString += `第${key}名的分数：${value}\n`
      }
    }
    return resultString
  }
  /** 通关人数查询
   *  参数列表：
   * data：数据源
   */
  function queryLiberator(data) {
    let resultString = ""
    let liberator = data[data.length - 1]
    liberator[1].map((score, index) => {
      switch (index) {
        case 0:
          score = 'Normal通关人数：' + score + '\n'
          break
        case 1:
          score = 'Hard通关人数：' + score + '\n'
          break
        case 2:
          score = 'VeryHard通关人数：' + score + '\n'
          break
        case 3:
          score = 'HardCore通关人数：' + score + '\n'
          break
        case 4:
          score = 'Extreme通关人数：' + score + '\n'
          break
        case 5:
          score = 'Insane通关人数：' + score + '\n'
          break
        case 6:
          score = 'Torment通关人数：' + score + '\n'
          break
      }
      resultString += score
    })
    return `通关人数\n` + resultString
  }
  /** 最高分查询
   *  参数列表：
   *  data：数据源
   */
  function queryTop(data) {
    let resultString = ''
    data.map((score, index) => {
      if (score === -1) {
        score = "暂未统计"
      }
      switch (index) {
        case 0:
          score = 'Normal最高分：' + score + '\n'
          break
        case 1:
          score = 'Hard最高分：' + score + '\n'
          break
        case 2:
          score = 'VeryHard最高分：' + score + '\n'
          break
        case 3:
          score = 'HardCore最高分：' + score + '\n'
          break
        case 4:
          score = 'Extreme最高分：' + score + '\n'
          break
        case 5:
          score = 'Insane最高分：' + score + '\n'
          break
        case 6:
          score = 'Torment最高分：' + score + '\n'
          break
      }
      resultString += score
    })
    return '难度最高分\n' + resultString
  }
  /** 排名或分数查询
   *  参数列表：
   *  data：数据源
   *  score: 待查询分数或排名
   *  rank: 查询类型判断
   */
  function queryRank(data, score, rank) {
    if (rank) {
      let index = data.findIndex(([value]) => value <= score)
      let res = index !== -1 ? data.slice(0, index + 1) : data
      let sum = res.reduce((total, [, value]) => total + value, 0)
      return `分数：${score}\n排名：${sum}名\n`
    } else {
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        sum += data[i][1]
        if (sum >= score) return `分数：${data[i][0]}\n排名：${score}名\n`
      }
      return '查询排名超过2档\n'
    }
  }
  //图片渲染
  function toPng(data) {
    let lines = data.split('\n')//行分割
    const fontSize = 20
    const lineHeight = 1.2
    const height = (lines.length + 1) * fontSize * lineHeight
    let lineWidth = lines.reduce((maxWidth, line) => Math.max(maxWidth, line.length), 0) * 0.75//最长行
    const canvas = ctx.canvas.createCanvas(lineWidth * fontSize, height)
    const context = canvas.getContext("2d")
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.font = `${fontSize}px "Microsoft YaHei", sans-serif`
    context.fillStyle = "#000000"
    for (let i = 0; i < lines.length; i++) {
      context.fillText(lines[i], fontSize, fontSize * lineHeight * (i + 1))
    }
    return canvas.toDataURL()
  }
}
