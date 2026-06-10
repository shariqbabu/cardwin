// api/wallet/createDeposit.ts

import type {
VercelRequest,
VercelResponse,
} from '@vercel/node';

import {
FieldValue,
} from 'firebase-admin/firestore';

import {
adminDb,
} from '../_lib/firebaseAdmin';

import {
verifyToken,
setCorsHeaders,
} from '../_lib/verifyAuth';

export default async function handler(
req: VercelRequest,
res: VercelResponse
) {
setCorsHeaders(res);

if (req.method === 'OPTIONS') {
return res.status(200).end();
}

if (req.method !== 'POST') {
return res.status(405).json({
error: 'Method not allowed',
});
}

try {
const uid = await verifyToken(
req.headers.authorization
);

```
const {
  amount,
  screenshotUrl,
  utrNumber,
} = req.body;

if (
  !amount ||
  Number(amount) < 100
) {
  return res.status(400).json({
    error:
      'Minimum deposit amount is ₹100',
  });
}

if (!screenshotUrl) {
  return res.status(400).json({
    error:
      'Payment screenshot required',
  });
}

if (
  !utrNumber ||
  utrNumber.trim().length < 6
) {
  return res.status(400).json({
    error:
      'Valid UTR number required',
  });
}

const userSnap =
  await adminDb
    .collection('users')
    .doc(uid)
    .get();

if (!userSnap.exists) {
  return res.status(404).json({
    error: 'User not found',
  });
}

const user =
  userSnap.data();

const depositRef =
  adminDb
    .collection('deposits')
    .doc();

await depositRef.set({
  uid,

  userName:
    user?.name || '',

  userEmail:
    user?.email || '',

  amount:
    Number(amount),

  screenshotUrl,

  utrNumber:
    utrNumber.trim(),

  status:
    'PENDING',

  adminNote:
    '',

  createdAt:
    FieldValue.serverTimestamp(),

  updatedAt:
    FieldValue.serverTimestamp(),
});

return res.status(200).json({
  success: true,
  depositId:
    depositRef.id,
});


} catch (error: any) {
console.error(
'Create Deposit Error:',
error
);


const status =
  error.message ===
  'Unauthorized'
    ? 401
    : 400;

return res.status(status).json({
  error:
    error.message ||
    'Failed to create deposit',
});


}
}
