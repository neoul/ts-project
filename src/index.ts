import { Command } from "commander";
import {
    Account,
    Aptos,
    AptosConfig,
    Ed25519Account,
    Ed25519PrivateKey,
    Network,
    AnyNumber,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
// import * as util from "util";
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

type Args = {
    secret_key: string;
    secret_key_file: string;
};

export const program = new Command();
program.name("sidekick-burn");
program.description("Supervlabs burn token");
program.option(
    "-k, --secret_key <secret_key>",
    "Secret key in hexadecimal format",
);
program.option(
    "-f, --secret_key_file <secret_key_file>",
    "Secret key file path",
);

program.action(async (args: Args) => {
    if (!args.secret_key && !args.secret_key_file) {
        console.error("Please provide a secret key or a secret key file.");
        process.exit(1);
    }

    let secretKey: string;
    if (args.secret_key) {
        secretKey = args.secret_key;
    } else {
        const secretKeyFile = args.secret_key_file;
        if (!secretKeyFile) {
            console.error("Please provide a secret key file.");
            process.exit(1);
        }
        try {
            const secretKeyBuffer = fs.readFileSync(secretKeyFile, "utf8");
            secretKey = secretKeyBuffer;
            console.log(`Secret key loaded from file: ${secretKey}`);
        } catch (error) {
            console.error(`Error reading secret key file: ${error.message}`);
            process.exit(1);
        }
    }
    const config = new AptosConfig({ network: Network.MAINNET });
    const aptos = new Aptos(config);

    const key = new Ed25519PrivateKey(secretKey);
    const account = new Ed25519Account({ privateKey: key });

    const tokens = await list(aptos, account).catch((error) => {
        console.error(error);
        process.exit(1);
    });
    await burn(aptos, account, tokens).catch((error) => {
        console.error(error);
        process.exit(1);
    });
    console.log("Burning tokens completed successfully.");
});

type TokenList = Awaited<ReturnType<Aptos["getOwnedDigitalAssets"]>>;

async function list(aptos: Aptos, account: Account) {
    let offset: AnyNumber = 0;
    const limit: number = 100;
    const tokenlist: TokenList = [];
    while (true) {
        const tokens = await aptos.getOwnedDigitalAssets({
            ownerAddress: account.accountAddress,
            minimumLedgerVersion: 0,
            options: {
                offset,
                limit,
            },
        });
        const filtered = tokens.filter((token) => {
            return (
                token.current_token_data.current_collection.collection_name ===
                "SuperV Sidekicks"
            );
        });
        tokenlist.push(...filtered);
        filtered.forEach((token) => {
            console.log(token.token_data_id);
        });

        if (tokens.length < limit) {
            break;
        }
        offset += limit;
    }
    console.log(
        `Total SuperV Sidekicks: ${tokenlist.length} in ${account.accountAddress}`,
    );
    return tokenlist;
}

function chunkArray<T>(array: T[], chunkSize: number = 100): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

async function burn(aptos: Aptos, account: Account, tokens: TokenList) {
    const tokensPerBatch = 100;
    const batches = chunkArray(tokens, tokensPerBatch);
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const transaction = await aptos.transaction.build.simple({
            sender: account.accountAddress,
            data: {
                function:
                    "0x09d518b9b84f327eafc5f6632200ea224a818a935ffd6be5d78ada250bbc44a6::sidekick::batch_delete",
                functionArguments: [batch.map((token) => token.token_data_id)],
            },
        });
        const [userTransactionResponse] =
            await aptos.transaction.simulate.simple({
                signerPublicKey: account.publicKey,
                transaction,
            });
        // console.log(userTransactionResponse);
        // console.log(util.inspect(transaction, { depth: null }));
        const senderAuthenticator = aptos.transaction.sign({
            signer: account,
            transaction,
        });
        const submittedTransaction = await aptos.transaction.submit.simple({
            transaction,
            senderAuthenticator,
        });
        console.log(`transaction batch ${i}: ${submittedTransaction.hash}`);
        const executedTransaction = await aptos.waitForTransaction({
            transactionHash: submittedTransaction.hash,
        });
        if (!executedTransaction.success) {
            console.error(
                `Transaction batch ${i} failed:`,
                executedTransaction.vm_status,
            );
            break;
        }
    }
}

program.parse();
