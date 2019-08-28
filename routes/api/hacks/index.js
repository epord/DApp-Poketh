const  {blockToJson}  = require( "../../../utils/utils");
const  {blockInterval}  = require( "../../../services/block");
const  {generateSMTFromTransactions, getTransactionBytes, submitBlock}  = require( "../../../utils/cryptoUtils");
const  { BlockService }  = require( '../../../services');

const express 					= require('express')
	, router 					= express.Router({ mergeParams: true })
	, debug 					= require('debug')('app:api:hacks')
	, BigNumber       			= require('bignumber.js')
	, Status 					= require('http-status-codes');

debug('registering /api/hacks routes')

const responseWithStatus = (res) => (err, status) => {
	if (err && !err.statusCode) return res.status(Status.INTERNAL_SERVER_ERROR).json(err);
	if (err && err.statusCode) return res.status(err.statusCode).json(err.message);
	if (!status.statusCode) return res.status(Status.INTERNAL_SERVER_ERROR).json("No message");
	return res.status(status.statusCode).json(status.message)
};

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
router.post('/transactions/create', (req, res, next) => {
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
		.exec((err, lastBlock) => {
			if(err) return responseWithStatus(res)(err);

			let nextNumber;
			if(!lastBlock) {
				nextNumber = blockInterval;
			} else {
				const rest = lastBlock.block_number.mod(blockInterval);
				nextNumber = lastBlock.block_number.minus(rest).plus(blockInterval);
			}

			const t = {
				slot: slotBN,
				owner: owner,
				recipient: recipient,
				hash: hash,
				block_spent: blockSpentBN,
				mined: true,
				mined_block: nextNumber,
				signature: signature,
				mined_timestamp: timestamp,

			};

			const sparseMerkleTree = generateSMTFromTransactions([t]);
			const rootHash = sparseMerkleTree.root;

			BlockService.create({
				_id: nextNumber,
				timestamp,
				root_hash: rootHash,
				transactions: [] //TODO create empty block cause we dont want no corrupted transactions in our DB
			}, (err, block) => {
				if(err) return responseWithStatus(res)(err);
				submitBlock(block, (err) => {
					if(err) return responseWithStatus(res)(err) //TODO rollback block creation

					let blockJSON =  blockToJson(block);
					blockJSON.transactions = [t];
					let exitingBytes = getTransactionBytes(t.slot, t.block_spent, new BigNumber(1), t.recipient);

					const message = {
						block: blockJSON,
						exitData: {
							slot: t.slot,
							bytes: exitingBytes,
							hash: t.hash,
							proof: sparseMerkleTree.createMerkleProof(t.slot.toFixed()),
							signature: t.signature,
						}
					};

					return responseWithStatus(res)(null, {statusCode: 201, message: message})
				});
			});
		});
});

// router.get('/transactions/:id([0-9a-zA-z]+)/exitData', (req, res, next) => {
// 	const { id } = req.params;
//
// 	TransactionService.findById(id).exec((err, t) => {
// 		if(err) return responseWithStatus(res)(err);
// 		if(!t)  return responseWithStatus(res)({ statusCode: 404, message: 'Transaction not found'});
// 		if(!t.mined_block) return responseWithStatus(res)({ statusCode: Status.CONFLICT, message: 'Transaction not yet mined'});
//
// 		getExitDataForBlock(t.slot, t.mined_block, responseWithStatus(res));
// 	});
// });

module.exports = router;