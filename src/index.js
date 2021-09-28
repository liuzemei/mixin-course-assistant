const { BlazeClient, searchNetworkAsset, readNetworkAsset } = require('mixin-node-sdk')
const config = require('../config.json')
const QRCode = require('qrcode')
const { validate: isUUID } = require('uuid')


const client = new BlazeClient(config,
  { parse: true, syncAck: true }
)

client.loopBlaze({
  async onMessage(msg) {
    const isHandle = await handleMsg(msg)
    if (!isHandle) return sendHelpMsgWithInfo(msg.user_id, "指令输入不正确。")
  },
  onAckReceipt() {
  },
  onTransfer(msg) {
    handleReceivedDonate(msg)
  }
})
// - 如果用户输入的是 非文本消息，直接结束
// - 如果用户输入的是 `/claim` 则直接走 `handleClaim`，然后直接结束
// - 如果用户输入的是 `/donate` 则直接走 `handleDonate`，然后直接结束
// - 如果用户输入的是 `uuid` 则同时查询 `user` 和 `asset`，然后结束
// - 如果用户输入的是 `数字` 则只查询 `user`，然后结束
// - 如果用户输入的是 `非数字` 则只查询 `asset`，然后结束
// - 结束后判断，如果是 false，则返回帮助信息 + 2个 button

async function handleMsg(msg) {
  const { category, data } = msg
  if (category !== 'PLAIN_TEXT')
    return sendHelpMsgWithInfo(user_id, "仅支持文本消息。")
  if (data === '/claim') return handleClaim(msg)
  if (data === '/donate') return handleDonate(msg)
  if (isUUID(data)) {
    const res = await Promise.all([
      handleUser(msg),
      handleAsset(msg)
    ])
    return res.some(v => v)
  }
  return isNaN(Number(data)) ? handleAsset(msg) : handleUser(msg)
}


// 1. 逻辑分析
//    - 用户给机器人发送 `user_id` 或 `identity_number` 
//    - 机器人收到消息后，进行查询。
//    - 如果没查到，说明用户的输入错误，结束。
//    - 如果查到了，则给用户发送卡片、转账button、转账二维码。
//    - 如果确认用户输入的是 `identity_number` ，则再多给用户发送一条 `user_id`

async function handleUser({ user_id, data }) {
  const user = await client.readUser(data)
  if (!user || !user.user_id) return false
  const transferAction = `mixin://transfer/${user.user_id}`
  await Promise.all([
    client.sendContactMsg(user_id,
      { user_id: user.user_id }),
    client.sendAppButtonMsg(user_id, [
      {
        label: `Transfer to ${user.full_name}`,
        action: transferAction,
        color: "#000000"
      }
    ]),
    new Promise(resolve => {
      QRCode.toBuffer( // 将 transferAction -> jpeg 的 buf
        transferAction,
        async (err, buf) => {
          const { attachment_id } = await client.uploadFile(buf) // 上传 buf
          await client.sendImageMsg(user_id, { // 发送图片消息
            attachment_id, // 资源id
            mime_type: "image/jpeg",
            width: 300,
            height: 300,
            size: buf.length,
            thumbnail: Buffer.from(buf).toString('base64'), // 封面， buf 的base64
          })
          resolve()
        })
    }),
    new Promise(async resolve => {
      if (data !== user.user_id)
        await client.sendTextMsg(user_id, user.user_id)
      resolve()
    })
  ])
  return true
}

// - 用户给机器人发送 `asset_id` 或 `symbol` 
// - 机器人收到消息后，进行查询。
// - 如果没查到，说明用户的输入错误，结束。
// - 如果查到了，则给用户发送查询到的 文章 消息，
// - 如果确认用户输入的是 `symbol` ，则再多给用户发送一条 `asset_id`(查到的第1个资产第asset_id)

async function handleAsset({ user_id, data }) {
  if (isUUID(data)) {
    const asset = await readNetworkAsset(data)
    if (!asset || !asset.asset_id) return false
    await client.sendPostMsg(user_id, '```json\n' +
      JSON.stringify(asset, null, 2) +
      '\n```'
    )
  } else {
    const assets = await searchNetworkAsset(data)
    if (assets.length === 0) return false
    await Promise.all([
      client.sendPostMsg(user_id, '```json\n' +
        JSON.stringify(assets, null, 2) +
        '\n```'
      ),
      client.sendTextMsg(user_id, assets[0].asset_id)
    ])
  }
  return true
}

const cnb_asset_id = '965e5c6e-434c-3fa9-b780-c50f43cd955c'
// - 用户给机器人发送 `/claim`
// - 机器人收到消息后，进行查询该用户是否领取。
// - 如果已领取，则发送 `您今日已领取，请明日再来。`
// - 如果没领取，则向该用户转账 `1cnb`

async function handleClaim({ user_id }) {
  const trace_id = client.uniqueConversationID(
    user_id + client.keystore.client_id,
    new Date().toDateString()
  )
  const transfer = await client.readTransfer(trace_id)
  if (!transfer || !transfer.trace_id) {
    await client.transfer({
      trace_id,
      asset_id: cnb_asset_id,
      amount: '1',
      opponent_id: user_id
    })
  } else {
    await client.sendTextMsg(user_id, `您今日已领取，请明日再来。`)
  }
  return true
}

// - 用户给机器人发送 `/donate`
// - 机器人收到消息后，给用户发送自己的转账按钮
// - 若用户成功转账，则向用户回复 “打赏的 {amount}{symbol} 已收到，感谢您的支持。
async function handleDonate({ user_id }) {
  const transferAction = `mixin://transfer/${client.keystore.client_id}`
  await client.sendAppButtonMsg(user_id, [
    {
      label: `打赏`,
      action: transferAction,
      color: "#000000"
    }
  ])
  return true
}

async function handleReceivedDonate({ user_id, data }) {
  const { asset_id, amount } = data
  if (Number(amount) <= 0) return
  const { symbol } = await readNetworkAsset(asset_id)
  await client.sendTextMsg(user_id, `打赏的 ${amount} ${symbol} 已收到，感谢您的支持。`)
}

const helpMsg = `
1. 支持用户查询，请发送 user_id | identity_number
2. 支持资产查询，请发送 asset_id | symbol
3. 支持每日领取 1cnb，请发送 /claim 或点击签到
4. 支持打赏，请发送 /donate 或点击打赏
`
async function sendHelpMsgWithInfo(user_id, info) { // 发送帮助消息
  await Promise.all([
    client.sendTextMsg(user_id, info + helpMsg),
    client.sendAppButtonMsg(user_id, [
      { label: "签到", action: "input:/claim", color: "#000" },
      { label: "打赏", action: "input:/donate", color: "#000" }
    ])
  ])
  return true
}