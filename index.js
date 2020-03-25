const ethers = require('ethers');

const provider = ethers.getDefaultProvider();

const ETH_FLIP_ADDRESS = "0xd8a04f5412223f513dc55f839574430f5ec15531";
const OSM_ADDRESS = "0x81FE72B5A8d1A857d176C3E7d5Bd2679A9B85763";

var tau = 21600; // 6 hours
var ttl = 21600; // 6 hours
const cushionTime = 600; // 10 minutes

let osmABI = [
    "event LogValue(bytes32 val)"
];

const TEND = "0x4b43ed1200000000000000000000000000000000000000000000000000000000";
const FILE = "0x29ae811400000000000000000000000000000000000000000000000000000000";
const _TAU = "0x7461750000000000000000000000000000000000000000000000000000000000";
const _TTL = "0x74746c0000000000000000000000000000000000000000000000000000000000";

const osmContract = new ethers.Contract(OSM_ADDRESS, osmABI, provider);

var auctions = [];

function getType(topic) {
    if (topic === TEND) {
        return "TEND";
    } else if (topic === FILE) {
        return "FILE";
    }
}

async function getEthPrice(block) {
    let prec18 = ethers.utils.bigNumberify("10000000000000000");

    let filter = osmContract.filters.LogValue();
    filter.fromBlock = block - 600;
    filter.toBlock = block;

    let logs = await provider.getLogs(filter);
    let price = ethers.utils.bigNumberify(logs[logs.length - 1].data).div(prec18) / 100;
    return price;
}

function registerTend(log, price, timestamp) {
    let prec18 = ethers.utils.bigNumberify("100000000000000");
    let prec27 = ethers.utils.bigNumberify("1000000000000000000000000000");
    let id = ethers.utils.bigNumberify(log.topics[2]).toString();
    let lot = ethers.utils.bigNumberify(log.topics[3]).div(prec18).toNumber() / 10000;

    let bidHex = "0x" + log.data.slice(288, -248);
    let bid = ethers.utils.bigNumberify(bidHex).div(prec27).div(prec18).toNumber() / 10000;
    let paid = bid / lot;

    let diff = (((paid / price)) * 100).toFixed(2);
    let auction = {'id': id, 'lot':lot, 'bid':bid, 'end': timestamp + tau};

    // auction is very low in bidding
    if (diff < 5) {
        console.log("Low aucution bid registered ID:" + id);
        auctions[id] = auction;
    } else {
        console.log("Higher aucution bid registered ID:" + id);
        delete auctions[id];
    }
}

function registerFile(log) {
    if (log.topics[2] === _TAU) {
        tau = parseInt(log.topics[3]);
        console.log("tau has been updated to: " + tau + " seconds");
    } else if (log.topics[2] === _TTL) {
        ttl = parseInt(log.topics[3]);
        console.log("ttl has been updated to: " + ttl + " seconds");
    }
}

function subscribe() {
    const filterAll = {
        address: ETH_FLIP_ADDRESS
    }

    provider.on(filterAll, async (log) => {
        let type = getType(log.topics[0]);
        let price = await getEthPrice(log.blockNumber);
        let timestamp = await (await provider.getBlock(log.blockNumber)).timestamp;
        if (type === "TEND") {
            await registerTend(log, price, timestamp);
        } else if (type === "FILE") {
            await registerFile(log);
        }
    });

    console.log("Listening for new TEND actions...");
}

function checkAuctions(timestamp) {
    for (auction in auctions) {
        if (auction && auctions[auction]["end"] < timestamp) {
            console.log("low auction closed")
            console.log(auctions[auction])
            delete auctions[auction]
        } else if (auction && auctions[auction]["end"] - cushionTime < timestamp) {
            console.log("10 minutes left in low auction")
            console.log(auctions[auction])
        }
    }
}

function checkBlocks() {
    provider.on('block', async (blockNumber) => {
        console.log('New Block: ' + blockNumber);
        let timestamp = await (await provider.getBlock(blockNumber)).timestamp;
        checkAuctions(timestamp);
    });
}

checkBlocks();
subscribe();