import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { generateSigner, signerIdentity } from '@metaplex-foundation/umi'

const umi = createUmi('https://api.devnet.solana.com')

// Generate a new keypair signer.
const signer = generateSigner(umi)

// Tell Umi to use the new signer.
umi.use(signerIdentity(signer))


// register mpl-token-metadata to umi
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'

umi.use(mplTokenMetadata());