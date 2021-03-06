import {CryptoUtils} from "../../../utils/CryptoUtils";
import {Utils} from "../../../utils/Utils";
import {blockInterval} from "../../../services/block";
import * as Status from 'http-status-codes'
import * as express from 'express';
import BigNumber from "bignumber.js";
import {NativeError} from "mongoose";
import {IBlock} from "../../../models/block";
import {BlockService, TransactionService} from "../../../services";
import {ITransaction} from "../../../models/transaction";

const router 					= express.Router({ mergeParams: true })
	, debug 					= require('debug')('app:api:hacks');

debug('registering /api/hacks routes');

/**
 * Creates an Unchecked Transaction
 * {
 *  "slot": int|string,
 *  "blockSpent": int|string,
 *  "owner": string (hex),
 *  "recipient":string (hex),
 *  "hash": string (hex) [ keccak256(uint64(slot), uint256(blockSpent), owner, recipient) ],
 *  "signature" string (hex) [sig of hash]
 * }
 */
router.post('/transactions/create', (req: express.Request, res: express.Response, next) => {
	let { slot, owner, recipient, hash, blockSpent, signature } = req.body;

	if (slot == undefined || !owner || !recipient || !hash || blockSpent == undefined || !signature) {
		return res.status(Status.BAD_REQUEST).json('Missing parameter');
	}

	const slotBN = new BigNumber(slot);
	if(slotBN.isNaN()) {
		return res.status(Status.BAD_REQUEST).json('Invalid slot');
	}

	const blockSpentBN = new BigNumber(blockSpent);
	if(blockSpentBN.isNaN()) {
		return res.status(Status.BAD_REQUEST).json('Invalid blockSpent');
	}

	owner = owner.toLowerCase();
	recipient = recipient.toLowerCase();

	const timestamp = Date.now();


	BlockService
		.findOne({})
		.sort({_id: -1})
		.collation({locale: "en_US", numericOrdering: true})
		.exec((err: NativeError, lastBlock: IBlock) => {
			if (err) return Utils.responseWithStatus(res)(err);

			let nextNumber: BigNumber;
			if (!lastBlock) {
				nextNumber = blockInterval;
			} else {
				const rest = lastBlock.block_number.mod(blockInterval);
				nextNumber = lastBlock.block_number.minus(rest).plus(blockInterval);
			}

			TransactionService.create({
				_id: hash,
				slot: slotBN,
				owner: owner,
				recipient: recipient,
				block_spent: blockSpentBN,
				mined: true,
				mined_block: nextNumber,
				signature: signature,
				invalidated: true
			}, (err: any, t: ITransaction) => {
				if (err) return Utils.responseWithStatus(res)(err); //TODO rollback block creation
				const sparseMerkleTree = CryptoUtils.generateSMTFromTransactions([t]);
				const rootHash = sparseMerkleTree.root;

				BlockService.create({
					_id: nextNumber,
					timestamp,
					root_hash: rootHash,
					transactions: [t]
				}, (err: NativeError, block: IBlock) => {
					if (err) return Utils.responseWithStatus(res)(err);
					CryptoUtils.submitBlock(block, async (err) => {
						if (err) return Utils.responseWithStatus(res)(err);

						let blockJSON = Utils.blockToJson(block);
						let exitingBytes = await CryptoUtils.getTransactionBytes(t);

						const message = {
							block: blockJSON,
							exitData: {
								slot: t.slot,
								bytes: exitingBytes,
								hash: t.hash,
								proof: sparseMerkleTree.createMerkleProof(t.slot.toFixed()),
								signature: t.signature,
								block: t.mined_block,
							}
						};

						return Utils.responseWithStatus(res)(null, {statusCode: 201, result: message})
					});
				});
			});
		});
});

export default router;