/**
 * 对照 app.bak 的自助观星：下载 Config_w.sgs，用游戏同一套
 * CtrUtil wasm（CFBDecryptor）解开配置，汇总成给页面用的 JSON。
 */
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const configUrl = 'https://web.sanguosha.com/220/h5_2/res/config/Config_w.sgs';
const wasmUrl = 'https://web.sanguosha.com/220/h5_2/libs/min/aesresc';
const skinBase = 'https://web.sanguosha.com/220/h5_2/res/runtime/pc/general/big/bigSkin/';

const mundaneNames = [
  '欢乐豆', '手气卡', '点将卡', '换将卡', '诏令天下', '夺宝券', '夺宝碎片', '夺宝重置券',
  '绑定元宝', '桃花', '菜篮子', '招募令', '武将包', '皮肤包', '稀有皮肤包', '豪华皮肤包',
  '朱砂', '灵宝', '功勋', '普通将印宝箱', '稀有将印宝箱', '史诗将印宝箱', '校尉将印', '大将军印'
];
const duobaoNameBlock = new Set([
  '枭雄金印', '水晶碎片', '圣魂玄晶', '史诗皮肤锦囊', '传说皮肤锦囊', '至臻皮肤礼盒', '谋定水晶自选礼盒'
]);
const generalNameBlock = new Set(['赵襄', '沙摩柯(SP)', '孙尚香(界限突破)']);
const descNameBlock = new Set(['祈福灯', '圣魂玄晶', '枭雄金印']);
const wishNamePrefixes = [...mundaneNames, '水晶碎片', '圣魂玄晶', '传世玉玺'];
const nestedIdBlock = new Set([0x187cd, 0x30da5, 0x143891]);
const columnOrder = ['时间', '名称', '说明', '价格', '奖励', '限购', '编号', '效果', '信息', '预估价格'];
const numericColumns = new Set(['价格', '限购', '编号', '预估价格']);
const fieldNames = new Map([
  ['id', '编号'], ['name', '名称'], ['time', '时间'], ['desc', '说明'], ['reward', '奖励'],
  ['price', '价格'], ['max', '限购'], ['effect', '效果'], ['info', '信息']
]);

function shanghaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function todayStamp(date = new Date()) {
  const parts = shanghaiParts(date);
  return `${parts.year}${parts.month}${parts.day}T000002`;
}

function formatUpdatedAt(date = new Date()) {
  const parts = shanghaiParts(date);
  return `${parts.year}/${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstStamp(value) {
  return String(value ?? '').match(/[0-9]{8}T[0-9]{6}/)?.[0] ?? '';
}

function leadingYear(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? Number(digits.slice(0, 4)) : 0;
}

function formatTime(value) {
  const text = String(value ?? '');
  const range = text.match(/(\d{4})(\d{2})(\d{2})\s*[;；—\-~至]\s*(\d{4})(\d{2})(\d{2})/);
  if (range) return `${Number(range[2])}月${Number(range[3])}日-${Number(range[5])}月${Number(range[6])}日`;
  const one = text.match(/(\d{4})(\d{2})(\d{2})/);
  if (one) return `${Number(one[2])}月${Number(one[3])}日`;
  return text;
}

function unzip(buffer) {
  const files = {};
  let offset = 0;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    files[name] = method === 8 ? zlib.inflateRawSync(compressed) : compressed;
    offset = dataStart + compressedSize;
  }
  return files;
}

function createDecryptor(instance) {
  const exports = instance.exports;
  const getInfo = (id) => {
    const words = new Uint32Array(exports.memory.buffer);
    const rttiBase = exports.__rtti_base.value;
    return words[(rttiBase + 4 >>> 2) + (id >>> 0) * 2];
  };
  const alignOf = (info) => 31 - Math.clz32((info >>> 6) & 31);
  const newArray = (id, values) => {
    const info = getInfo(id);
    const align = alignOf(info);
    const bufferPointer = exports.__new(values.length << align, info & 4 ? id : 0);
    let result = bufferPointer;
    if ((info & 4) === 0) {
      const arrayPointer = exports.__new(info & 2 ? 16 : 12, id);
      const words = new Uint32Array(exports.memory.buffer);
      words[arrayPointer >>> 2] = exports.__retain(bufferPointer);
      words[(arrayPointer + 4) >>> 2] = bufferPointer;
      words[(arrayPointer + 8) >>> 2] = values.length << align;
      if (info & 2) words[(arrayPointer + 12) >>> 2] = values.length;
      result = arrayPointer;
    }
    new Uint8Array(exports.memory.buffer).set(values, bufferPointer);
    return result;
  };
  return (data) => {
    const source = new Uint8Array(data);
    const padded = new Uint8Array(source.length + (16 - (source.length % 16)));
    padded.set(source);
    const pointer = exports.__retain(newArray(exports.Uint8Array_ID.value, padded));
    const decryptor = exports['CFBDecryptor#constructor'](0, 0, 0, 16);
    const outputPointer = exports['CFBDecryptor#decrypt'](decryptor, pointer);
    exports.__release(pointer);
    const words = new Uint32Array(exports.memory.buffer);
    const info = getInfo(words[(outputPointer - 8) >>> 2]);
    const align = alignOf(info);
    const dataPointer = info & 4 ? outputPointer : words[(outputPointer + 4) >>> 2];
    const length = info & 2
      ? words[(outputPointer + 12) >>> 2]
      : words[(dataPointer - 4) >>> 2] >>> align;
    const output = new Uint8Array(exports.memory.buffer).slice(dataPointer, dataPointer + length).slice(0, source.length);
    exports.__release(outputPointer);
    return output;
  };
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function parseConfigFile(files, decrypt, fileName) {
  const encrypted = files[fileName];
  if (!encrypted) throw new Error(`Config_w.sgs 缺少 ${fileName}`);
  return JSON.parse(zlib.gunzipSync(Buffer.from(decrypt(encrypted))).toString('utf8'));
}

function expandGoods(record, abbreviation) {
  const expanded = {};
  for (const [key, value] of Object.entries(record)) expanded[abbreviation.get(key) ?? key] = value;
  return expanded;
}

function buildCatalog(files, decrypt) {
  const goodsFile = parseConfigFile(files, decrypt, 'sys_gs_dbs_fs_goodsbaseinfo.sgs');
  const abbreviation = new Map(asArray(goodsFile.root?.abbreviation?.field).map((field) => [field.Short, field.Long]));
  const byId = new Map();
  for (const goods of asArray(goodsFile.root?.goodslist?.goods)) {
    const expanded = expandGoods(goods, abbreviation);
    byId.set(Number(expanded.ID), expanded);
  }
  const tips = new Map();
  const shop = parseConfigFile(files, decrypt, 'sys_h5_shop.sgs');
  for (const tip of asArray(shop.root?.itemtips)) {
    if (tip.e) tips.set(Number(tip.a), String(tip.e));
  }
  const drops = new Map();
  const dropFile = parseConfigFile(files, decrypt, 'sys_server_item_drops_templete_config.sgs');
  const dropItems = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value.a != null && value.d != null && value.DropItem == null) dropItems.push(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(dropFile.AllDrop);
  for (const item of dropItems) {
    const groupId = Number(item.a);
    const list = drops.get(groupId) ?? [];
    list.push(Number(item.d));
    drops.set(groupId, list);
  }
  const generals = new Map();
  const characters = parseConfigFile(files, decrypt, 'character.sgs');
  for (const general of asArray(characters.GameCharacters?.character)) {
    generals.set(Number(general.a), String(general.b ?? ''));
  }
  const cache = new Map();
  const describe = (id) => {
    const numericId = Number.parseInt(id, 10);
    if (cache.has(numericId)) return cache.get(numericId);
    const goods = { ...(byId.get(numericId) ?? {}) };
    const effect = expandEffect(goods.usedeffect, byId, drops, cache);
    if (tips.has(numericId)) goods.info = tips.get(numericId);
    if (effect) goods.effect = effect;
    cache.set(numericId, goods);
    return goods;
  };
  return { byId, drops, generals, describe };
}

function expandEffect(usedEffect, byId, drops, cache) {
  const value = Number.parseInt(usedEffect, 10);
  if (!Number.isFinite(value) || value === 1000 || Math.abs(value) <= 0) return '';
  if (cache.has(`effect:${value}`)) return cache.get(`effect:${value}`);
  cache.set(`effect:${value}`, '');
  const names = (drops.get(Math.abs(value)) ?? []).map((id) => byId.get(id)?.name || expandEffect(id, byId, drops, cache)).filter(Boolean);
  const text = names.join(value > 0 ? '/' : '&');
  cache.set(`effect:${value}`, text);
  return text;
}

function nameCount(raw, describe) {
  const parts = String(raw ?? '').replace(/[^0-9,.]/g, '').split(',').map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || Number.isNaN(parts[0])) return String(raw ?? '');
  const name = describe(parts[0]).name ?? parts[0];
  return Number(parts[1]) > 1 ? `${name}*${parts[1]}` : String(name);
}

function goodsDesc(goods) {
  if (descNameBlock.has(goods.name)) return '';
  const returned = String(goods.returngoods ?? '');
  if (returned && returned !== '0') {
    const parts = returned.split(';').filter((part) => /[0-9]+,[0-9]+/.test(part));
    if (parts.length) return parts;
  }
  const used = String(goods.usedeffect ?? '');
  if (/^([0-9]+,[0-9]+;?)+$/.test(used)) return used;
  if (goods.effect) return goods.effect;
  return goods.info || '';
}

function renderDesc(desc, describe) {
  if (Array.isArray(desc)) return desc.map((part) => nameCount(part, describe)).join(';');
  if (/^([0-9]+,[0-9]+;?)+$/.test(String(desc))) {
    return String(desc).replace(/([0-9]+),[0-9,]+/g, (_all, id) => nameCount(`${id},1`, describe));
  }
  return desc;
}

function buildReport(files, decrypt, today) {
  const { byId, describe, drops, generals } = buildCatalog(files, decrypt);
  const report = {
    '结果为代码自动推演和预测，请以最终公告为准！更新时间': new Date().toLocaleString(),
    '【充值消费】': []
  };
  const push = (section, row) => {
    report[section] ||= [];
    report[section].push(row);
  };

  const questFile = parseConfigFile(files, decrypt, 'gn_dbs_quest.sgs');
  const quests = asArray(questFile.TaskAll?.Task)
    .filter((task) => String(task._attributes?.clientTimeStart ?? '') >= today)
    .map((task) => {
      const attributes = task._attributes;
      let reward = task.Reward;
      let joiner = ',';
      if (reward?.SelectReward) {
        reward = reward.SelectReward;
        joiner = '/';
      }
      const items = asArray(reward?.RewardItem);
      return {
        id: attributes.id,
        time: `${String(attributes.timeStart).slice(0, 8)}—${String(attributes.timeEnd).slice(0, 8)}`,
        desc: `【${attributes.name}】${attributes.desc ?? ''}`,
        reward: items.map((item) => nameCount(`${item._attributes.itemId},${item._attributes.count}`, describe)).join(joiner)
      };
    });
  const h5Quest = parseConfigFile(files, decrypt, 'sys_h5_quest.sgs');
  for (const task of asArray(h5Quest.root?.Task)) {
    if (String(task.ClientTimeStart ?? '') < today) continue;
    const extra = task.ExtraRewards ? String(task.ExtraRewards).split(';').filter(Boolean) : [];
    quests.push({
      id: task.Id,
      time: `${String(task.ClientTimeStart).slice(0, 8)}—${String(task.ClientTimeEnd).slice(0, 8)}`,
      desc: `【${task.Name}】${task.Desc ?? ''}`,
      reward: [`${task.Rewards},${task.Count}`, ...extra].map((part) => nameCount(part, describe)).join(task.SelectRewards ? '/' : ',')
    });
  }

  const taskFile = parseConfigFile(files, decrypt, 'sys_h5_task.sgs');
  const questSections = {};
  for (const node of asArray(taskFile.TaskAll?.TaskNode)) {
    if (!node.quest_id || !coversToday(node.duration, today)) continue;
    const ids = String(node.quest_id).split(';').map(Number).filter(Boolean);
    const start = String(node.duration || quests.find((quest) => ids.includes(Number(quest.id)) && quest.time)?.time || today).slice(0, 8);
    let title = `${start}·【${String(node.name ?? '').replace(/.*盲盒.*/, '盲盒福利')}】`;
    title = title.replace(/.*(充值|消费).*/, '【充值消费】');
    for (const id of ids) questSections[id] = title;
  }
  for (const quest of quests) {
    const section = questSections[quest.id] ?? `${today.slice(0, 8)}·【其它任务】`;
    const { id, ...row } = quest;
    push(section, row);
  }

  const lottery = parseConfigFile(files, decrypt, 'ff_dbs_lottery_new.sgs');
  const lotteryRows = asArray(lottery.root?.ShopGoods).filter((goods) => firstStamp(goods.timeRange) >= today).map((goods) => ({
    time: String(goods.timeRange ?? '').replace(/.*?([0-9]+)T[0-9]+,([0-9]+)T[0-9]+/, (_all, start, end) => `${start}-${end}`),
    desc: `消耗·星石币*${goods.exchangecount}`,
    reward: nameCount(`${goods.Id},${goods.counts}`, describe)
  }));
  if (lotteryRows.length > 1) report[`${String(lotteryRows[0].time).slice(0, 8)}·兑换【占星秘宝】`] = lotteryRows;

  const exchange = parseConfigFile(files, decrypt, 'ff_exchange_new.sgs');
  for (const shop of asArray(exchange.root?.Common)) {
    if (firstStamp(shop.duration) < today) continue;
    const section = `${String(shop.duration).slice(0, 8)}·【${describe(shop.itemid).name ?? ''}】兑换`;
    const rows = asArray(shop.goods).slice().sort((left, right) => Number(right.exchangecount1) - Number(left.exchangecount1)).map((goods) => {
      const counts = String(goods.counts ?? '').split(';');
      return {
        time: `${String(shop.duration).slice(0, 8)}—${String(shop.duration).slice(16, 24)}`,
        desc: `消耗·${nameCount(`${goods.itemid2 ?? shop.itemid},${goods.exchangecount2 ?? goods.exchangecount1}`, describe)}${goods.limitcounts ? `,限${goods.limitcounts}次` : ''}`,
        reward: String(goods.Id2 ?? '').split(';').map((id, index) => nameCount(`${id},${counts[index] ?? 1}`, describe)).join('/')
      };
    });
    report[section] = (report[section] ?? []).concat(rows);
  }

  const chests = parseConfigFile(files, decrypt, 'sys_treasure_chest.sgs');
  for (const chest of asArray(chests.root?.Common)) {
    if (firstStamp(chest.duration) < today) continue;
    const section = `${String(chest.duration).slice(0, 8)}·开启【${describe(chest.itemid).name ?? chest.name ?? ''}】`;
    report[section] = asArray(chest.rewards).map((reward) => ({
      time: `${String(chest.duration).slice(0, 8)}—${String(chest.duration).slice(16, 24)}`,
      desc: `开启·${nameCount(`${chest.itemid},${reward.counts}`, describe)}`,
      reward: Object.entries(reward)
        .filter(([key, value]) => /^goodsid\d+$/.test(key) && /[0-9]+,[0-9]+/.test(String(value)))
        .map(([, value]) => String(value).replace(/([0-9]+,[0-9]+);?([0-9]+,[0-9]+)?/, (_all, first, second) => nameCount(first, describe) + (second ? `[${nameCount(second, describe)}]` : '')))
        .join(Number(reward.rewardstype) === 2 ? '/' : ',')
    }));
  }

  const client = parseConfigFile(files, decrypt, 'sys_h5_dbs_clientserverpub.sgs');
  const duobaoNames = [];
  const duobaoRows = asArray(client.client?.DuoBao?.[0]?.item).filter((item) => String(item.BeginTime) > today).flatMap((item) => {
    const period = `${String(item.BeginTime).slice(0, 8)}-${String(item.EndTime).slice(0, 8)}`;
    const dropped = (drops.get(Math.abs(Number(item.DropId))) ?? []).map(describe).filter((goods) => goods.name && !mundaneNames.includes(goods.name));
    const droppedIds = dropped.map((goods) => goods.ID);
    const exchanged = (drops.get(Math.abs(Number(item.ExchangeId))) ?? []).map(describe).filter((goods) => {
      if (droppedIds.includes(goods.ID)) return true;
      if (Number(goods.TypeID) === 0x2b && String(goods.name).endsWith('动态套装')) return false;
      if (Number(goods.TypeID) === 0x24 && String(goods.name).startsWith('文和乱武*')) return false;
      if (Number(goods.TypeID) === 0x19 && generalNameBlock.has(goods.name)) return false;
      return !duobaoNameBlock.has(goods.name);
    });
    const ids = [...new Set([...droppedIds, ...exchanged.map((goods) => goods.ID)])];
    return ids.map(describe).map((goods) => ({
      time: period,
      name: goods.name,
      price: [droppedIds.includes(goods.ID) ? '四角' : '', exchanged.some((entry) => entry.ID === goods.ID) && goods.fragment ? `${goods.fragment}夺宝碎片` : ''].filter(Boolean).join('/'),
      desc: renderDesc(goodsDesc(goods), describe),
      typeId: goods.TypeID,
      pic: goods.PicID
    }));
  });
  if (duobaoRows.length) {
    report['夺宝行动'] = duobaoRows.map(({ typeId, pic, ...row }) => row);
    duobaoNames.push(...duobaoRows.map((row) => row.name));
  }

  const futureGoods = [];
  const wishGoods = [];
  const nestedIds = [];
  for (const stored of byId.values()) {
    const goods = describe(stored.ID);
    const start = firstStamp(goods.SellTime);
    if (start < today || Number(goods.ID) === 0xcbd55) continue;
    if (!goods.lotteryPrice && goods.returngoods) {
      for (const match of String(goods.returngoods).matchAll(/([0-9]+),[0-9,]+/g)) {
        const nestedId = Number.parseInt(match[1], 10);
        if (!nestedIdBlock.has(nestedId)) nestedIds.push(nestedId);
      }
    }
    if (goods.lotteryPrice) wishGoods.push(goods.ID);
    else futureGoods.push(goods.ID);
  }
  const skinFile = parseConfigFile(files, decrypt, 'cha_gs_dbs_fs_skininfo.sgs');
  const manuItems = asArray(skinFile.root?.manu?.item ?? skinFile.root?.manu);
  const datedIds = [...new Set([
    ...manuItems.filter((item) => String(item.SellTime ?? '') > today).map((item) => Number(item.baseID)),
    ...futureGoods,
    ...nestedIds
  ])].filter((id) => Number.isFinite(id));
  const skins = [];
  for (const id of datedIds) {
    const goods = describe(id);
    if (!goods?.name || mundaneNames.concat(duobaoNames).includes(goods.name)) continue;
    const row = {
      ...(goods.SellTime ? { time: String(goods.SellTime).replace(/.*?([0-9]+)T[0-9]+;([0-9]+)T[0-9]+/, (_all, start, end) => `${start}-${end}`) } : {}),
      name: goods.name
    };
    if (goods.exchange?.includes(',')) row.price = nameCount(goods.exchange, describe);
    else if (goods.shopvisual && Number.isFinite(Number(goods.yuanbao)) && Number(goods.yuanbao) !== 999999) {
      row.price = `${goods.yuanbao}${goods.yuanbaoonly ? '通用元宝' : '元宝'}`;
      const [days, count] = String(goods.maxBuyCount ?? '').split(';');
      if (Number(days) > 0 && count) row.max = `${count}个/${days === '1' ? '' : days}天`;
    }
    const desc = renderDesc(goodsDesc(goods), describe);
    if (desc) row.desc = desc;
    if (Number(goods.TypeID) === 0x24 || /\*[^\d]/.test(goods.name ?? '')) skins.push({ name: goods.name, res: goods.PicID });
    const text = `${row.time ?? ''}${row.price ?? ''}`;
    if (text.includes('夺宝') || String(row.price).includes('灵宝')) push('夺宝行动', row);
    else if (row.max) push('限购礼包', row);
    else push('其它道具', row);
  }
  report['其它道具']?.sort((left, right) => Number(Boolean(right.price)) - Number(Boolean(left.price)));

  const wishGroups = new Map();
  for (const id of wishGoods) {
    const goods = describe(id);
    const returnedId = Number.parseInt(String(goods.returngoods ?? '').split(';')[1]?.split(',')[0], 10);
    if (Number(describe(returnedId).TypeID) !== 0x19) continue;
    const price = goods.lotteryPrice;
    const names = wishGroups.get(price) ?? [];
    names.push(String(goods.name).replace('武将', '').replace(/\(.*?\)/g, ''));
    wishGroups.set(price, names);
  }
  if (wishGroups.size) {
    report['祈福武将'] = [...wishGroups.entries()].sort((left, right) => Number(left[0]) - Number(right[0])).map(([price, names]) => ({
      price: `${price}同心结`,
      reward: names.join('/')
    }));
  }

  const tiangong = parseConfigFile(files, decrypt, 'ff_tiangong.sgs');
  const wishDrops = [];
  for (const drop of asArray(tiangong.root?.Drop)) {
    const label = nameCount(`${drop.ItemId},${drop.MaxCount}`, describe);
    if (wishNamePrefixes.some((prefix) => label.startsWith(prefix))) continue;
    wishDrops[drop.Id] ||= [];
    wishDrops[drop.Id].push(label);
  }
  const wishes = [];
  for (const entry of asArray(tiangong.root?.Common)) {
    const openDay = Number.parseInt(String(entry.Duration2).slice(0, 8), 10) + 1;
    if (openDay < Number.parseInt(today, 10)) continue;
    const existing = wishes.find((row) => row.name === entry.Name);
    if (existing) existing.time += `;${openDay}`;
    else wishes.push({ name: entry.Name, reward: generals.get(Number(entry.bigrewards)) ?? entry.bigrewards, time: String(openDay) });
  }
  for (const row of wishes) {
    const matched = wishDrops.find((labels) => labels?.includes(row.reward));
    if (matched) row.reward = matched.join(',');
  }
  if (wishes.length) report['祈愿台'] = wishes;

  const chess = parseConfigFile(files, decrypt, 'ff_chess.sgs');
  const floors = new Map();
  for (const floor of asArray(chess.root?.NewChess)) {
    floors.set(floor.PlanId2, (floors.get(floor.PlanId2) ?? 0) + (Number.parseInt(floor.MaxFloors, 10) || 0));
  }
  const scrolls = [];
  for (const entry of asArray(chess.root?.Common)) {
    const duration = entry.duration2 ?? entry.Duration2 ?? '';
    const openDay = Number.parseInt(String(duration).slice(0, 8), 10) + 1;
    if (openDay < Number.parseInt(today, 10)) continue;
    scrolls.push({
      reward: describe(entry.GrandPrize).name ?? entry.GrandPrize,
      预估价格: Math.floor((floors.get(entry.PlanID2) ?? 0) / 2),
      time: `${openDay}-${String(duration).slice(16, 24)}`
    });
  }
  if (scrolls.length) report['绘卷'] = scrolls;
  report['新品皮肤'] = skins.map(({ name }) => ({ name }));

  for (const [section, value] of Object.entries(report)) {
    report[section] = Array.isArray(value) ? value.map((row) => renameFields(row)) : value;
  }
  return { report, skins };
}

function coversToday(duration, today) {
  if (!duration) return true;
  const stamps = String(duration).match(/[0-9]{8}T[0-9]{6}/g) ?? String(duration).split(',');
  return (!stamps[0] || String(stamps[0]) <= today) && (!stamps[1] || String(stamps[1]) >= today);
}

function renameFields(row) {
  const renamed = {};
  for (const [key, value] of Object.entries(row)) {
    if (value == null || value === '') continue;
    renamed[fieldNames.get(key) ?? key] = value;
  }
  return renamed;
}

const noteTitle = '结果为代码自动推演和预测，请以最终公告为准！更新时间';

function toPayload(report, skins, updatedAt) {
  const sections = [];
  for (const [title, value] of Object.entries(report)) {
    if (title === noteTitle || title === '新品皮肤' || !Array.isArray(value) || leadingYear(title) >= 2098) continue;
    const sourceRows = value.filter((row) => row && typeof row === 'object' && leadingYear(row['时间']) < 2098);
    if (!sourceRows.length) continue;
    const columns = columnOrder.filter((column) => sourceRows.some((row) => row[column] != null && row[column] !== ''));
    for (const row of sourceRows) {
      for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
    }
    sections.push({
      kind: 'table',
      title,
      columns,
      rows: sourceRows.map((row) => {
        const cells = {};
        for (const column of columns) {
          const raw = row[column] ?? '';
          cells[column] = column === '时间' ? formatTime(raw) : String(raw);
        }
        return cells;
      })
    });
  }
  if (skins.length) sections.push({ kind: 'skins', title: '新品皮肤', items: skins });
  return { note: noteTitle, updatedAt, sections };
}

async function resolveSkins(skins) {
  const images = new Map();
  const queue = skins.filter((skin) => skin.res);
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const skin = queue.shift();
      const full = `${skinBase}${skin.res}.png`;
      try {
        const response = await fetch(full, { method: 'GET' });
        if (!response.ok) continue;
        images.set(skin.name, {
          name: skin.name,
          full,
          thumb: full.replace('bigSkin', 'static').replace('big/s', 'seat/s')
        });
      } catch {
        // 单张皮肤图失败不影响整份报表。
      }
    }
  });
  await Promise.all(workers);
  return skins.filter((skin) => images.has(skin.name)).map((skin) => images.get(skin.name));
}


const wasmBytes = await download(wasmUrl);

async function openDecryptor() {
  const { instance } = await WebAssembly.instantiate(wasmBytes, {
    env: {
      memory: new WebAssembly.Memory({ initial: 256, maximum: 256 }),
      STACKTOP: 0,
      abort() { throw new Error('wasm abort'); },
      seed: Date.now()
    }
  });
  return createDecryptor(instance);
}

let cache = null;
let pending = null;

export async function loadReport() {
  if (pending) return pending;
  pending = buildPayload().finally(() => {
    pending = null;
  });
  return pending;
}

async function buildPayload() {
  const day = todayStamp().slice(0, 8);
  const bytes = await download(configUrl);
  const digest = crypto.createHash('sha1').update(bytes).digest('hex');
  if (cache && cache.digest === digest && cache.day === day) {
    return { ...cache.payload, updatedAt: formatUpdatedAt() };
  }

  const archive = cache?.digest === digest ? cache.archive : unzip(bytes);
  const { report, skins } = buildReport(archive, await openDecryptor(), todayStamp());
  const skinItems = cache?.digest === digest && cache.skinItems ? cache.skinItems : await resolveSkins(skins);
  const payload = toPayload(report, skinItems, formatUpdatedAt());
  cache = { day, digest, archive, skinItems, payload };
  console.log(payload.sections.map((section) => `${section.title}(${section.kind === 'skins' ? section.items.length : section.rows.length})`).join(' | '));
  return payload;
}

