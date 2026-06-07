import { doc, collection, setDoc, getDoc, updateDoc, onSnapshot, runTransaction, serverTimestamp, query, where, getDocs, orderBy, limit, increment, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from './config';
import { DiceGame, DiceBet } from '../types';
import { addFunds } from './wallet';
import { calculateUsableBalance, deductFromWallet } from '../utils/helpers';

const COLLECTION = 'diceGames';
const BETTING_TIME = 15000; // 15 sec betting
const delay = (ms:number)=>new Promise(r=>setTimeout(r,ms));

// Auto cleanup stuck games
const cleanup = async ()=>{
  const snap = await getDocs(query(collection(db,COLLECTION), where('status','in',['betting','rolling']), orderBy('createdAt','desc'), limit(5)));
  for(const d of snap.docs){
    const g = d.data() as DiceGame;
    if(Date.now() - g.createdAt.toMillis() > 60000){
      await updateDoc(d.ref, { status:'result', result:'EVEN', updatedAt: serverTimestamp() });
    }
  }
};

export const createDiceRound = async ():Promise<string>=>{
  await cleanup();
  const q = query(collection(db,COLLECTION), where('status','in',['betting','rolling']), orderBy('createdAt','desc'), limit(1));
  const snap = await getDocs(q);
  if(!snap.empty) return snap.docs[0].id;

  const ref = doc(collection(db, COLLECTION));
  await setDoc(ref, {
    id: ref.id, status:'betting', roundNumber: Date.now(),
    dice1: null, dice2: null, sum: null, result: null,
    bets: [], pot: 0,
    bettingEndsAt: Timestamp.fromDate(new Date(Date.now()+BETTING_TIME)),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return ref.id;
};

export const placeDiceBet = async (gameId:string, uid:string, name:string, amount:number, prediction:'ODD'|'EVEN')=>{
  await runTransaction(db, async tx=>{
    const gRef = doc(db, COLLECTION, gameId);
    const wRef = doc(db, 'wallets', uid);
    const [g,w] = await Promise.all([tx.get(gRef), tx.get(wRef)]);
    const game = g.data() as DiceGame;
    if(game.status!=='betting') throw new Error('Betting closed');
    if(game.bets?.some(b=>b.uid===uid)) throw new Error('Already placed');
    if(calculateUsableBalance(w.data() as any) < amount) throw new Error('Low balance');
    const nb = deductFromWallet(w.data() as any, amount)!;
    tx.update(wRef, {...nb, updatedAt:serverTimestamp()});
    tx.update(gRef, { bets: arrayUnion({uid,name,amount,prediction,placedAt:Timestamp.now()}), pot: increment(amount) });
  });
};

export const rollDiceRound = async (gameId:string)=>{
  const ref = doc(db, COLLECTION, gameId);
  let game = (await getDoc(ref)).data() as DiceGame;
  if(!game || game.status!=='betting') return;

  await updateDoc(ref, { status:'rolling', updatedAt:serverTimestamp() });
  await delay(1000);

  const dice1 = Math.floor(Math.random()*6)+1;
  const dice2 = Math.floor(Math.random()*6)+1;
  const sum = dice1+dice2;
  const result = sum%2===0 ? 'EVEN' : 'ODD';

  await updateDoc(ref, { dice1, dice2, sum, result });
  await delay(2500); // rolling animation time

  await updateDoc(ref, { status:'result', updatedAt:serverTimestamp() });

  // Payout 1.9x
  for(const b of game.bets||[]){
    if(b.prediction===result){
      await addFunds(b.uid, Math.floor(b.amount*1.9), 'winningBalance', `Dice Win ${result}`);
    }
  }
};

export const subscribeLatestDice = (cb:(id:string,g:DiceGame)=>void)=>{
  return onSnapshot(query(collection(db, COLLECTION), orderBy('createdAt','desc'), limit(1)),
    s=>{ if(!s.empty){ const d=s.docs[0]; cb(d.id, {id:d.id, ...d.data()} as DiceGame) } }
  );
};
