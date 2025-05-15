// events-full.js
require('dotenv').config();
const axios = require('axios');
const fs    = require('fs');
const { Interface } = require('ethers');

const ADDR        = '0x421C76cd7C1550c4fcc974F4d74c870150c45995';
const ABI         = JSON.parse(fs.readFileSync('./usdxAbi.json', 'utf8'));
const KEY         = process.env.ETHERSCAN_API_KEY;
const START_BLOCK = 7_975_700;          // contract deployment
const CHUNK       = 5_000;              // fits Etherscan limits

const iface   = new Interface(ABI);
const toJSON  = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

(async () => {
  const tipHex = (
    await axios.get('https://api-sepolia.etherscan.io/api', {
      params: { module: 'proxy', action: 'eth_blockNumber', apikey: KEY }
    })
  ).data.result;
  const TIP = parseInt(tipHex, 16);

  const out = fs.createWriteStream('./events-full.json');
  out.write('[');
  let first = true;

  for (let from = START_BLOCK; from <= TIP; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, TIP);

    const { data } = await axios.get('https://api-sepolia.etherscan.io/api', {
      params: {
        module: 'logs',
        action: 'getLogs',
        address: ADDR,
        fromBlock: from,
        toBlock:   to,
        apikey:    KEY
      }
    });

    data.result.forEach(log => {
      let ev;
      try {
        ev = iface.parseLog(log);
        ev = {
          ...ev,
          blockNumber:  parseInt(log.blockNumber, 16),
          timestamp:    new Date(parseInt(log.timeStamp, 16) * 1000),
          transactionHash: log.transactionHash
        };
      } catch { ev = log; }

      out.write((first ? '' : ',') + JSON.stringify(ev, toJSON));
      first = false;
    });

    // throttle: Etherscan 5 req/s free tier
    await new Promise(r => setTimeout(r, 210));
  }

  out.write(']');
  out.end();
  console.log(`Done. Blocks ${START_BLOCK}-${TIP} processed.`);
})();
