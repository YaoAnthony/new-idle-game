import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  newJoinCode,
  newPlayerId,
  newSessionId,
  normalizeJoinCode,
} from '../src/multiplayer/codes.js'

/**
 * 发号器。两条约束不是风格问题，破了会出真事故：
 *
 * 1. 邀请码的字母表**去掉了 I/L/O/0/1**——这个码是要念给朋友听的，
 *    "是数字 1 还是字母 l"每出现一次就是一次进不去房间；
 * 2. playerId **同时是客户端对象 id 的发号方前缀**（`<playerId>:drop:rice#8`），
 *    所以字符集必须避开分隔符 `:` 和 `#`，否则解析对象 id 时会切错。
 */

const ALLOWED_CODE = /^[A-HJ-NP-Z2-9]{6}$/
const CONFUSABLE = ['I', 'L', 'O', '0', '1']

test('邀请码：6 位、字母表受限、不含易混字符', () => {
  for (let i = 0; i < 500; i += 1) {
    const code = newJoinCode()
    assert.match(code, ALLOWED_CODE, `摇出了不合法的码：${code}`)
    for (const char of CONFUSABLE) {
      assert.ok(!code.includes(char), `${code} 里有易混字符 ${char}`)
    }
  }
})

test('邀请码：500 次里几乎不会撞（8.9 亿组合）', () => {
  const codes = new Set<string>()
  for (let i = 0; i < 500; i += 1) codes.add(newJoinCode())

  assert.ok(codes.size >= 499, `500 次摇出了 ${codes.size} 个不同的码，随机性可疑`)
})

test('邀请码：整个字母表都摇得到，不是只在前几个字符里打转', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 3000; i += 1) {
    for (const char of newJoinCode()) seen.add(char)
  }

  // 字母表 31 个字符，3000×6 次抽样一个都不漏才正常
  assert.equal(seen.size, 31, `只摇出了 ${seen.size} 种字符`)
})

test('归一化：大小写和首尾空格都不该是"房间不存在"', () => {
  assert.equal(normalizeJoinCode('abc234'), 'ABC234')
  assert.equal(normalizeJoinCode('  ABC234  '), 'ABC234')
  assert.equal(normalizeJoinCode('\tAbC234\n'), 'ABC234')
  assert.equal(normalizeJoinCode(''), '')
})

test('归一化不动中间的字符（不是"去掉所有空格"）', () => {
  // 真有人把码念成两段时，服务端该回 not_found 而不是猜
  assert.equal(normalizeJoinCode(' ABC 234 '), 'ABC 234')
})

test('playerId：hex 前缀形态，且不含对象 id 的分隔符', () => {
  for (let i = 0; i < 300; i += 1) {
    const id = newPlayerId()
    assert.match(id, /^p-[0-9a-f]{8}$/, `不合法的 playerId：${id}`)
    assert.ok(!id.includes(':'), '含 : 会把对象 id 切错')
    assert.ok(!id.includes('#'), '含 # 会把对象 id 切错')
  }
})

test('playerId：一场会话（≤5 人）里撞不上', () => {
  const ids = new Set<string>()
  for (let i = 0; i < 1000; i += 1) ids.add(newPlayerId())

  assert.ok(ids.size >= 999, `1000 次摇出了 ${ids.size} 个不同的 id`)
})

test('sessionId：更长的 hex，和 playerId 不共用前缀', () => {
  const id = newSessionId()
  assert.match(id, /^s-[0-9a-f]{16}$/)
  assert.ok(!id.startsWith('p-'))
})
