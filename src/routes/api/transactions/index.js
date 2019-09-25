import {Utils} from "../../../utils/Utils";
import {createTransaction} from "../../../services/transaction";
import {createAtomicSwapComponent, revealSecret} from "../../../services/atomicSwap";

const express 					= require('express')
	, router 					= express.Router({ mergeParams: true })
	, debug 					= require('debug')('app:api:transactions')
	, Status 					= require('http-status-codes')
	, { TransactionService }	= require('../../../services')
	, BigNumber       			= require('bignumber.js');

debug('registering /api/transactions routes')

router.get('/:id([A-Za-z0-9]+)', (req, res, next) => {
	TransactionService
		.findById(req.params.id)
		.exec((err, transaction) => {
			if (err) return res.status(Status.INTERNAL_SERVER_ERROR).json(err);
			res.status(Status.OK).json(Utils.transactionToJson(transaction));
		})
});

router.get('swap-data/:id([A-Za-z0-9]+)', (req, res, next) => {
	TransactionService
		.findById(req.params.id)
		.exec((err, transaction) => {
			if (err) return res.status(Status.INTERNAL_SERVER_ERROR).json(err);
			res.status(Status.OK).json(Utils.transactionToJson(transaction));
		})
});

/**
 * Creates a Transaction
 * {
 *  "slot": int|string,
 *  "blockSpent": int|string,
 *  "owner": string (hex),
 *  "recipient":string (hex),
 *  "hash": string (hex) [ keccak256(uint256(slot), uint256(blockSpent), recipient) ],
 *  "signature" string (hex) [sig of hash]
 * }
 */
router.post('/create', (req, res, next) => {
	const { slot, owner, recipient, hash, blockSpent, signature } = req.body;

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

	createTransaction(slotBN, owner, recipient, hash, blockSpentBN, signature, Utils.responseWithStatus(res, Utils.transactionToJson))
});

/**
 * Creates an Atomic Swap Transaction
 * {
 *  "slot": int|string,
 *  "blockSpent": int|string,
 *  "owner": string (hex) (corresponds to A),
 *  "recipient":string (hex) (corresponds to B),
 *  "swappingSlot": int|string,
 *  "hashSecret" : string (hex)
 *  "hash": string (hex) [ keccak256(uint256(slot), uint256(blockSpent), hashSecret, recipient, swapping_slot) ],
 *  "signature" string (hex) [sig of hash]
 * }
 */
router.post('/create-atomic-swap', (req, res, next) => {
	const { slot, owner, recipient, hash, blockSpent, signature, swappingSlot, hashSecret } = req.body;

	if (slot == undefined || !owner || !recipient || !hash || blockSpent == undefined || swappingSlot == undefined || !hashSecret || !signature) {
		return res.status(Status.BAD_REQUEST).json('Missing parameter');
	}

	createAtomicSwapComponent(
		slot,
		blockSpent,
		owner,
		recipient,
		swappingSlot,
		hashSecret,
		hash,
		signature,
		Utils.responseWithStatus(res, Utils.transactionToJson)
	)
});

/**
 * Creates an Atomic Swap Transaction
 * {
 *  "secret" : string (hex)
 *  "slot": int|string
 *  "minedBlock": int|string
 * }
 */
router.post('/reveal-secret', (req, res, next) => {
	const { slot, minedBlock, secret } = req.body;

	if (!secret || slot == undefined || minedBlock == undefined) {
		return res.status(Status.BAD_REQUEST).json('Missing parameter secret');
	}

	revealSecret(slot, minedBlock, secret, Utils.responseWithStatus(res, Utils.transactionToJson));

});



module.exports = router;