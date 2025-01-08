import { Contract } from "@ethersproject/contracts";
import { Interface } from "@ethersproject/abi";
import { Web3Function, Web3FunctionEventContext } from "@gelatonetwork/web3-functions-sdk";
import { Scraper } from 'agent-twitter-client';

import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { parseAbi } from 'viem'

import {Groq} from "groq-sdk";

const PNP_MARKET_ABI = ["event PnpTwitterMarketCreated(bytes32 indexed conditionId, address indexed marketCreator)",
    "function settleTwitterMarket(bytes32 conditionId, uint256 _winningTokenId)",
];

async function analyzeTweetsForPrediction(marketQuestion:string, tweetsAsString:string){
    const system_prompt: Groq.Chat.ChatCompletionMessageParam = {
        "role": "system",
        "name": "PNP_Protocol",
        "content":
        "You are an objective AI judge analyzing a specific prediction market question. Your ONLY task is to carefully review the provided tweets and determine a binary YES or NO answer. Rules: 1) Base your answer strictly on the tweet content. 2) Analyze the tweets objectively and comprehensively. 3) Respond ONLY with 'YES' or 'NO' - no additional explanation, context, or commentary is allowed. 4) If the tweets are insufficient to make a clear determination, default to 'NO'."
    }
    const client = new Groq({apiKey:process.env.GROQ_API_KEY as string});
    try {
        const response: Groq.Chat.ChatCompletion = await client.chat.completions.create({
            model: 'llama-3.1-70b-versatile', // Choose an appropriate model
            messages: [
                system_prompt,
                {
                    "role": "user",
                    "content": `Market question: ${marketQuestion}\n\nTweets:\n${tweetsAsString}`
                }
            ],
            temperature: 0, // For deterministic results
            max_tokens: 1 // Since we're only looking for "YES" or "NO"
        });

        // Extract the response, which should be either "YES" or "NO"
        const answer: string = response.choices[0]?.message?.content?.trim().toUpperCase() || "UNDEFINED API CALL"
        return answer;
    }
    catch (error) {
        console.log(error);
        return "UNDEFINED API CALL";
    }
}

async function fetchTweets(username: string, numTweets: number) {
    const scraper = new Scraper();
    await scraper.login(
        process.env.TWITTER_USERNAME as string,
        process.env.TWITTER_PASSWORD as string,
    );
    const tweetsGenerator = await scraper.getTweets(username, numTweets);
    const tweetList = [];

    for await (const tweet of tweetsGenerator) {
        const isRetweet = tweet.isRetweet;
        const tweetText = isRetweet && tweet.retweetedStatus ? tweet.retweetedStatus.text : tweet.text;

        tweetList.push({
            isRetweet,
            tweetText
        });
    }

    return tweetList;
}

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
    // Get event log from Web3FunctionEventContext
  const { userArgs, multiChainProvider, log } = context;

  const baseProvider = multiChainProvider.chainId(8453);
  const url = baseProvider.connection.url;
  const client = createPublicClient({ transport: http(url), chain: base });

  const marketAddress = userArgs.marketAddress as string;
  const abi = PNP_MARKET_ABI;
  const marketContract = new Contract(marketAddress, abi, baseProvider);

  const betterABI = parseAbi(PNP_MARKET_ABI);

  // from the event conditionId, get the market question from mapping
  // from the event conditionId, get the market twitter username from mapping

  const pnpInterface = new Interface(PNP_MARKET_ABI);
  const eventData = pnpInterface.parseLog(log);
  const { conditionId, marketCreator } = eventData.args;
  console.log(`Someone just created a new twitter prediction market\n"`);
  console.log(`Condition ID: ${conditionId}\n`);
  console.log(`Market creator: ${marketCreator}\n`);
  console.log(`crazyyyyy\n`);

  const marketQuestion = await client.readContract({
    address: '0x2aAaE6bDc0d0dE0b0c0d0d0d0d0d0d0d0d0d0d0d', // bro change this
    abi: betterABI,
    functionName: "twitterQuestion",
    args: [conditionId]
  });

  const marketTwitterUsername  = await client.readContract({
    address: '0x2aAaE6bDc0d0dE0b0c0d0d0d0d0d0d0d0d0d0d0d', // bro change this
    abi: betterABI,
    functionName: "twitterSettlerId",
    args: [conditionId]
  });

  console.log(`Market question: ${marketQuestion}\n`);
  console.log(`Market twitter username: ${marketTwitterUsername}\n`);

  const tweets = await fetchTweets(marketTwitterUsername as string, 20);
  const tweetsAsString = tweets.map((tweet) => tweet.tweetText).join("\n");
  const prediction = await analyzeTweetsForPrediction(marketQuestion as string, tweetsAsString);
  console.log(`Prediction: ${prediction}\n`);

  // based on the answer, set the winningtokenId
  const winningTokenId = 1;

  return {
    canExec: true,
    callData: [
      {
        to: marketAddress,
        data: pnpInterface.encodeFunctionData("settleTwitterMarket", [conditionId, winningTokenId]),
      },
    ],
  };


});


//standard

// Llama 3.1 8B Instruct, Mistral 7B Instruct

