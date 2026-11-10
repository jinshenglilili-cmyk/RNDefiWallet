// keccak-256 纯 JS 实现（Legacy Keccak padding 0x01，以太坊签名用；非 NIST SHA3）
//
// 项目里没有 ethers/web3/keccak 依赖，合约调用的函数选择器（selector）
// 只能靠 keccak-256 现场计算。用 BigInt 实现一次吸收即可，性能足够。

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rho 偏移表 ROT[x][y]
const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const MASK = (1n << 64n) - 1n;

function rol(x, n) {
  n %= 64n;
  return ((x << n) | (x >> (64n - n))) & MASK;
}

function keccakF(a) {
  for (let rnd = 0; rnd < 24; rnd++) {
    // Theta
    const c = [0n, 1n, 2n, 3n, 4n].map((x) => a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4]);
    const d = [0, 1, 2, 3, 4].map((x) => c[(x + 4) % 5] ^ rol(c[(x + 1) % 5], 1n));
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) a[x][y] = (a[x][y] ^ d[x]) & MASK;
    }
    // Rho + Pi
    const b = Array.from({ length: 5 }, () => [0n, 0n, 0n, 0n, 0n]);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y][(2 * x + 3 * y) % 5] = rol(a[x][y], BigInt(ROT[x][y]));
      }
    }
    // Chi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        a[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y] & MASK);
      }
    }
    // Iota
    a[0][0] = (a[0][0] ^ RC[rnd]) & MASK;
  }
}

/** keccak-256：输入 Uint8Array/字符串（UTF-8），输出 32 字节 Uint8Array */
export function keccak256(input) {
  const msg = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const rate = 136;
  const a = Array.from({ length: 5 }, () => [0n, 0n, 0n, 0n, 0n]);

  // Legacy Keccak 填充：msg + 0x01 + 0* + 0x80（末字节），总长是 rate 的整数倍
  const padLen = rate - (msg.length % rate);
  const padded = new Uint8Array(msg.length + padLen);
  padded.set(msg);
  padded[msg.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      const lane = BigInt.asUintN(64, 0n);
      let value = 0n;
      for (let j = 7; j >= 0; j--) {
        value = (value << 8n) | BigInt(padded[off + i * 8 + j]);
      }
      a[i % 5][Math.floor(i / 5)] ^= value || lane;
    }
    keccakF(a);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    for (let x = 0; x < 5; x++) {
      let v = a[x][i];
      for (let j = 0; j < 8; j++) {
        out[i * 40 + x * 8 + j] = Number(v & 0xffn);
        v >>= 8n;
      }
    }
  }
  return out;
}

const HEX = '0123456789abcdef';
function toHex(bytes) {
  let s = '';
  for (const b of bytes) s += HEX[b >> 4] + HEX[b & 15];
  return s;
}

/**
 * 函数选择器（4 字节 hex，带 0x）
 * @param {string} sig 如 'transfer(address,uint256)'
 */
export function selector(sig) {
  return '0x' + toHex(keccak256(sig).slice(0, 4));
}
