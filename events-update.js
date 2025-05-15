// events-update.js
require('dotenv').config();
const axios  = require('axios');
const fs     = require('fs');
const { Interface } = require('ethers');

const ADDR   = '0x421C76cd7C1550c4fcc974F4d74c870150c45995';
const ABI    = JSON.parse(fs.readFileSync('./usdxAbi.json', 'utf8'));
const KEY    = process.env.ETHERSCAN_API_KEY;
const CHUNK  = 5_000;
const iface  = new Interface(ABI);
const fixBig = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

function loadExisting() {
  try { return JSON.parse(fs.readFileSync('./events-full.json')); }
  catch { return []; }
}

async function tipBlock() {
  const hex = (await axios.get('https://api-sepolia.etherscan.io/api', {
    params:{module:'proxy',action:'eth_blockNumber',apikey:KEY}
  })).data.result;
  return parseInt(hex, 16);
}

async function fetchLogs(from, to) {
  const { data } = await axios.get('https://api-sepolia.etherscan.io/api', {
    params:{
      module:'logs',
      action:'getLogs',
      address:ADDR,
      fromBlock:from,
      toBlock:to,
      apikey:KEY
    }
  });
  return data.result.map(l=>{
    try{
      const p = iface.parseLog(l);
      return {
        ...p,
        blockNumber: parseInt(l.blockNumber,16),
        timestamp:   new Date(parseInt(l.timeStamp,16)*1e3),
        transactionHash: l.transactionHash
      };
    }catch{ return l; }
  });
}

(async()=>{
  const events = loadExisting();
  const last   = events.reduce((m,e)=>Math.max(m,e.blockNumber||0),0);
  const tip    = await tipBlock();
  if (last >= tip){ console.log('No new blocks'); return; }

  for(let from = last+1; from<=tip; from+=CHUNK){
    const to = Math.min(from+CHUNK-1, tip);
    const newEvents = await fetchLogs(from,to);
    events.push(...newEvents);
    await new Promise(r=>setTimeout(r,210)); // free-tier throttle
  }

  fs.writeFileSync('./events-full.json', JSON.stringify(events, fixBig, 2));
  console.log(`Added ${events.length-last} events up to block ${tip}`);
})();
