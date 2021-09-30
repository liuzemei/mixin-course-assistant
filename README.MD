
# Mixin 小助理开发
[github仓库请点击](https://github.com/liuzemei/mixin-course-assistant)

[视频教程请点击](https://developers.mixinbots.com/courses/1e276ee9-18fb-42e3-915a-54b049679084/89329795-c5a2-4aa5-ab32-c52cf6649916)

本仓库旨在为学习 mixin messenger 的开发。
学习完，将会熟悉
- 通过机器人与 mixin messenger 的用户进行消息通信
- 根据 `user_id/identity_number` 获取用户详情
- 根据 `asset_id/symbol` 查询 mixin network 的资产详情
- 根据 日期、机器人id、用户id，构建唯一的转账 id
- 通过机器人跟用户转账
- 将 url 构建成二维码，然后上传到 mixin 服务器，并发送给用户
- 文章消息/文本消息/图片消息/联系人消息/按钮消息 的发送
- 通过按钮组来让用户选择输入。

### 1. 小助理介绍
（小助理机器人ID： 7000101422）主要是提供消息触发的服务机制。支持如下功能：
- 用户相关：发送 `user_id` 或 `identity_number` 回复指定用户的卡片及相关信息
- 资产相关：发送 `asset_id` 或者 `symbol` 回复指定资产相关信息


### 2. 课程大纲
1. 项目搭建与初始化 sdk
2. 完成用户相关逻辑
3. 完成资产相关逻辑
4. 完成签到相关逻辑
5. 完成打赏相关逻辑
6. 完成帮助相关逻辑
7. 组装上述逻辑

### 3. 正式开始开发
#### 3.1 项目搭建 与 websocket sdk引入
1. 项目搭建与初始化
> 打开终端初始化项目
```shell
mkdir mixin-course-assistant
cd mixin-course-assistant
npm init -y
npm install mixin-node-sdk
```

2. 在根目录下添加环境变量 config.json
/config.json
```json
{
  "pin": "",
  "client_id": "",
  "session_id": "",
  "pin_token": "",
  "private_key": ""
}
```

3. 在根目录下创建 index.js

4. 由于是消息服务，所以我们得连接 Mixin 的 websocket 用于接受消息
```js
const { BlazeClient } = require('mixin-node-sdk')
const config = require('./config.json')

// 这里的 parse:true 是sdk来解析 base64 的消息
// 这里的 syncAck:true 是sdk来帮我们 ack 消息
const client = new BlazeClient(config, { parse: true, syncAck: true })

client.loopBlaze({
  onMessage(msg) {
    console.log(msg)
  },
  // 我们不处理 ack 的消息，所以放一个空函数，这样就不会走到 onMessage 的逻辑里
  onAckReceipt() {
  }
})
```

5. 测试消息服务
打开终端
```shell
node index.js
```
> 打开手机跟自己的机器人发一条消息。看终端是否能打印出发送的消息。如果能，说明 websocket 连接成功。

#### 2. 编写 user_id 和 identity_number 的用户查询
1. 逻辑分析
   - 用户给机器人发送 `user_id` 或 `identity_number` 
   - 机器人收到消息后，进行查询。
   - 如果没查到，说明用户的输入错误，结束。
   - 如果查到了，则给用户发送卡片、转账button、转账二维码。
   - 如果确认用户输入的是 `identity_number` ，则再多给用户发送一条 `user_id`
2. 代码实现

```js
const QRCode = require('qrcode')
/**
 * 处理 identity_number 或者 user_id
 * 1. 联系人卡片 2. transfer btn 3. transfer qrcode 4. identity_number -> user_id
 * @returns {boolean} 如果判断成功，那么回复消息并返回 true，否则返回 false
 * @param {{data: '', user_id: ''}} msg 
 */
async function handleUser({ data, user_id }) {
  const user = await client.readUser(data) // 根据用户的输入来查询 user
  if (user && user.user_id) { // 走到这里说明 user 已经查询到了。
    const transferAction = `mixin://transfer/${user.user_id}` // 定义一个 transfer 的 schema 后边要用，
    // 这里同时发送3-4条消息所以使用 promise.all
    Promise.all([
      client.sendContactMsg( // 给用户发送联系人卡片
        user_id,
        { user_id: user.user_id }
      ),
      client.sendAppButtonMsg( // 给用户发送转账的 button
        user_id,
        [
          {
            label: `Transfer to ${user.full_name}`,
            action: transferAction,
            color: '#000'
          }
        ]
      ),
      new Promise(resolve => { // 给用户发送转账的二维码
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
      new Promise(async resolve => { // 如果用户查询的是 identity_number 的话，则给用户发送 user_id
        if (String(data) === user.identity_number)
          await client.sendTextMsg(user_id, user.user_id)
        resolve()
      })
    ])
    return true
  }
  return false
}
```

3. 测试

```js
//...
client.loopBlaze({
  onMessage(msg) {
    // 改造一下这里
    handleUser(msg)
  },
  onAckReceipt() {
  }
})
//...
```
> 1. 使用 mixin 移动端给机器人发送 `30265` ，看机器人是否会返回 4 条消息。
> 2. 再把返回的 `user_id` 发送给机器人，看机器人是否会返回跟第一步相同的 3 条消息。
> 3. 如果是则说明测试通过。

#### 3. 编写 asset_id 和 symbol 的资产查询
1. 逻辑分析
   - 用户给机器人发送 `asset_id` 或 `symbol` 
   - 机器人收到消息后，进行查询。
   - 如果没查到，说明用户的输入错误，结束。
   - 如果查到了，则给用户发送查询到的 文章 消息，
   - 如果确认用户输入的是 `symbol` ，则再多给用户发送一条 `asset_id`(查到的第1个资产第asset_id)
2. 代码实现

```js
const { validate: isUUID } = require('uuid') // mixin-node-sdk 包里有 uuid 了，所以可以直接引入
/**
 * 处理 asset_id 或者 symbol
 * 1. 资产相关的文章消息 2. symbol -> [0].asset_id
 * @returns {boolean} 如果判断成功，那么回复消息并返回 true，否则返回 false
 * @param {{data: '', user_id: ''}} msg 
 */
async function handleAsset({ data, user_id }) {
  if (isUUID(data)) {
    // 说明有可能是 asset_id
    const asset = await readNetworkAsset(data)
    if (asset && asset.asset_id) {
      // 说明是 asset_id，且已经查询到了
      await client.sendPostMsg(user_id, '```json\n' +
        JSON.stringify(asset, null, 2) +
        '\n```')// 发送 json 格式的 markdown
      return true
    }
  } else {
    // 说明有可能是 symbol
    const assets = await searchNetworkAsset(data)
    if (assets.length > 0) {
      // 说明是 symbol，且已经查询到了
      await Promise.all([
        client.sendPostMsg(user_id, '```json\n' +
          JSON.stringify(assets, null, 2) +
          '\n```'), // 返回 json 格式的 markdown
        client.sendTextMsg(user_id, assets[0].asset_id) // 返回 查询到的第一个 asset_id
      ])
      return true
    }
  }
  return false
}
```

3. 测试


```js
//...
client.loopBlaze({
  onMessage(msg) {
    // 改造一下这里
    handleAsset(msg)
  },
  onAckReceipt() {
  }
})
//...
```
> 1. 使用 mixin 移动端给机器人发送 `btc` ，看机器人是否会返回 2 条消息。
> 2. 再把返回的 `asset_id` 发送给机器人，看机器人是否会返回 1 条 btc 的资产相关消息。
> 3. 如果是则说明测试通过。

#### 4. 编写 `/claim` 向机器人签到并领取 1 CNB
1. 逻辑分析
   - 用户给机器人发送 `/claim`
   - 机器人收到消息后，进行查询该用户是否领取。
   - 如果已领取，则发送 `您今日已领取，请明日再来。`
   - 如果没领取，则向该用户转账 `1cnb`
2. 代码实现

```js
const cnb_asset_id = '965e5c6e-434c-3fa9-b780-c50f43cd955c' // 预先查询到了 cnb 的 asset_id 备用。
/**
 * 处理 /claim 的消息
 * 1. 给用户转账 1 cnb
 * @returns {boolean} 如果判断成功，那么回复消息并返回 true，否则返回 false
 * @param {{data: '', user_id: ''}} msg 
 */
async function handleClaim({data, user_id}) {
  const trace_id = client.uniqueConversationID(
    user_id + client.keystore.client_id,
    new Date().toDateString()
  ) // 用户这个用户今天唯一的 trace_id
  const transfer = await client.readTransfer(trace_id) // 查询今天是否领取过
  if (transfer && transfer.snapshot_id) {
    // 已经领取
    await client.sendMessageText(
      user_id,
      '您今日已领取，请明日再来。'
    )
  } else {
    // 否则的话给用户转 1 cnb
    await client.transfer({
      trace_id, 
      asset_id: cnb_asset_id,
      amount: '1',
      opponent_id: user_id,
    })
  }
}
```
3. 测试

```js
//...
client.loopBlaze({
  onMessage(msg) {
    // 改造一下这里
    handleClaim(msg)
  },
  onAckReceipt() {
  }
})
//...
```
> 1. 使用 mixin 移动端给机器人发送 `/claim` ，看机器人是否转账 1 cnb
> 2. 再发送一次 `/claim` ，看机器人是否回复 `您今日已领取，请明日再来。`
> 3. 如果是则说明测试通过。

#### 5. 编写 `/donate` 向机器人获取机器人转账地址
1. 逻辑分析
   - 用户给机器人发送 `/donate`
   - 机器人收到消息后，给用户发送自己的转账按钮
   - 若用户成功转账，则向用户回复 “打赏的 {amount}{symbol} 已收到，感谢您的支持。”
2. 代码实现

```js
// 1. 直接回复 donate 的按钮
async function handleDonate({user_id}) {
  client.sendAppButtonMsg( // 给用户发送 donate 的 button
    user_id,
    [
      {
        label: `点击向我捐赠`,
        action: `mixin://transfer/${client.keystore.client_id}`,
        color: '#000'
      }
    ]
  )
}

// 2. 在 loopBlaze 的地方，需要监听收到转账的消息。
client.loopBlaze({
  ...,
  async onTransfer({ data, user_id }) {
    const { amount, asset_id } = data
    const { symbol } = await client.readAsset(asset_id)
    client.sendMessageText(user_id, `打赏的 ${amount} ${symbol} 已收到，感谢您的支持。`)
  }
})
```

#### 6. 帮助信息 + 2 个交互按钮
```js
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
```

#### 7. 组装逻辑
1. 逻辑分析
  - 如果用户输入的是 非文本消息，直接结束
  - 如果用户输入的是 `/claim` 则直接走 `handleClaim`，然后直接结束
  - 如果用户输入的是 `/donate` 则直接走 `handleDonate`，然后直接结束
  - 如果用户输入的是 `uuid` 则同时查询 `user` 和 `asset`，然后结束
  - 如果用户输入的是 `数字` 则只查询 `user`，然后结束
  - 如果用户输入的是 `非数字` 则只查询 `asset`，然后结束
  - 结束后判断，如果是 false，则返回帮助信息 + 2个 button
2. 代码实现

```js
/**
 * 处理消息，如果处理成功则返回 true，否则返回 false
 * @param {{data: String, user_id: String}} msg 
 * @returns {boolean}
 */
async function handleMsg(msg) {
  const { data, category, user_id } = msg
  if (category !== 'PLAIN_TEXT')
    return sendHelpMsgWithInfo(user_id, "仅支持文本消息。")
  if (data === '/claim') return handleClaim(msg) // 处理 /claim 消息
  if (data === '/donate') return handleDonate(msg) // 处理 /donate 消息
  if (isUUID(data)) { // 处理 uuid 消息
    const res = await Promise.all([
      handleUser(msg),
      handleAsset(msg)
    ])
    return res.some(v => v)
  }
  if (isNaN(Number(data))) return handleAsset(msg) // 处理 symbol -> assets 的消息
  else return handleUser(msg) // 处理 identity_number -> user 的消息
}

```
3. 在 `onMessage` 中调用。
```js
//...
client.loopBlaze({
  // 改造一下这里
  async onMessage(msg) {
    const isHandle = await handleMsg(msg)
    if(!isHandle) return sendHelpMsgWithInfo(msg.user_id, "指令输入不正确。")
  },
  onAckReceipt() {
  },
  onTransfer() { // 这里可以再忽略一下转账消息
  }
})
//...
```
4. 测试
> 可以把上述的测试全部再走一遍。
> 全部通过，说明测试成功。
