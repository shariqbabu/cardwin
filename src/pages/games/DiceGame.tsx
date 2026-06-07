import React, { useState, useEffect, Suspense, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useAuth } from '../../context/AuthContext';
import { subscribeLatestDice, createDiceRound, placeDiceBet, rollDiceRound } from '../../firebase/diceGame';
import type { DiceGame, DiceBet } from '../../types';
import { calculateUsableBalance, formatCurrency } from '../../utils/helpers';
import { Trophy, TrendingDown, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import GameTimer from '../../components/games/GameTimer';

// WHITE DICE WITH CLEAR NUMBER
const DiceMesh: React.FC<{value:number; rolling:boolean}> = ({value, rolling}) => {
  const ref = useRef<THREE.Mesh>(null);
  const speed = useRef(0);
  
  useFrame((_, delta)=>{
    if(!ref.current) return;
    if(rolling){
      speed.current = Math.min(speed.current + delta*12, 18);
      ref.current.rotation.x += delta*speed.current;
      ref.current.rotation.y += delta*speed.current*0.7;
    } else {
      speed.current = Math.max(speed.current - delta*10, 0);
      ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, 0, 0.15);
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, 0, 0.15);
    }
  });

  return (
    <mesh ref={ref}>
      <RoundedBox args={[1.8,1.8,1.8]} radius={0.3} smoothness={4}>
        <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0} />
      </RoundedBox>
      <Text position={[0,0,0.91]} fontSize={1.2} color="#000000" anchorX="center" anchorY="middle" fontWeight={800}>
        {value}
      </Text>
    </mesh>
  );
};

const DiceScene: React.FC<{d1:number;d2:number;rolling:boolean}> = ({d1,d2,rolling}) => (
  <>
    <ambientLight intensity={0.9} />
    <pointLight position={[5,5,5]} intensity={1.2} color="#ffffff" />
    <group position={[-1.2,0,0]}><DiceMesh value={d1} rolling={rolling} /></group>
    <group position={[1.2,0,0]}><DiceMesh value={d2} rolling={rolling} /></group>
  </>
);

const BETS = [10,50,100,200,500];

export const DiceGame: React.FC = () => {
  const { user, wallet } = useAuth();
  const [game, setGame] = useState<DiceGame|null>(null);
  const [gameId, setGameId] = useState<string|null>(null);
  const [betAmount, setBetAmount] = useState(50);
  const [placing, setPlacing] = useState(false);
  const isRolling = useRef(false);

  const usable = wallet ? calculateUsableBalance(wallet) : 0;
  const myBet = game?.bets?.find(b=>b.uid===user?.uid);

  useEffect(()=>{
    const unsub = subscribeLatestDice(async (id,data)=>{
      setGameId(id); setGame(data);
      if(data.status==='betting' && !isRolling.current){
        // auto create next if needed handled by timer
      }
    });
    setTimeout(()=>{ if(!gameId) createDiceRound(); },1500);
    return ()=>unsub();
  },[]);

  const handleExpire = async()=>{
    if(!gameId || isRolling.current) return;
    isRolling.current = true;
    try{ await rollDiceRound(gameId); } 
    catch{} 
    finally{ setTimeout(()=>{isRolling.current=false; createDiceRound();},5000); }
  };

  const handleBet = async (pred:'ODD'|'EVEN')=>{
    if(!user||!gameId||!wallet) return;
    if(game?.status!=='betting') return toast.error('Betting closed');
    if(myBet) return toast.error('Already bet');
    if(usable < betAmount) return toast.error('Low balance');
    setPlacing(true);
    try{
      await placeDiceBet(gameId, user.uid, user.name||'Player', betAmount, pred);
      toast.success(`₹${betAmount} on ${pred}`);
    }catch(e:any){ toast.error(e.message); }
    finally{ setPlacing(false); }
  };

  const d1 = game?.dice1 || 1;
  const d2 = game?.dice2 || 2;
  const rolling = game?.status === 'rolling';
  const oddTotal = game?.bets?.filter(b=>b.prediction==='ODD').reduce((s,b)=>s+b.amount,0)||0;
  const evenTotal = game?.bets?.filter(b=>b.prediction==='EVEN').reduce((s,b)=>s+b.amount,0)||0;

  const getDate = (v:any)=> v?.toDate ? v.toDate() : new Date(Date.now()+15000);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-black text-white">🎲 Auto Dice</h2>
        <p className="text-gray-500 text-sm">Betting auto closes every 15s</p>
      </div>

      {/* Status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
        <span className={`text-sm font-bold ${game?.status==='betting'?'text-emerald-400': game?.status==='rolling'?'text-amber-400':'text-blue-400'}`}>
          {game?.status==='betting'?'BETTING OPEN': game?.status==='rolling'?'ROLLING...':`RESULT: ${game?.result}`}
        </span>
        {game?.status==='betting' && <GameTimer endsAt={getDate(game.bettingEndsAt)} onExpire={handleExpire} />}
      </div>

      {/* 3D Dice */}
      <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-2xl overflow-hidden" style={{height:240}}>
        <Canvas camera={{position:[0,0,6], fov:50}}>
          <Suspense fallback={null}><DiceScene d1={d1} d2={d2} rolling={rolling} /></Suspense>
        </Canvas>
      </div>

      {/* Result */}
      <AnimatePresence>
      {game?.status==='result' && myBet && (
        <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} 
          className={`rounded-xl p-4 text-center border-2 ${myBet.prediction===game.result?'bg-emerald-900/30 border-emerald-500':'bg-red-900/30 border-red-500'}`}>
          <div className="flex items-center justify-center gap-2">
            {myBet.prediction===game.result ? <Trophy className="w-6 h-6 text-yellow-400"/> : <TrendingDown className="w-6 h-6 text-red-400"/>}
            <span className="text-2xl font-black text-white">{d1}+{d2}={game.sum} ({game.result})</span>
          </div>
          <p className={`mt-1 font-bold ${myBet.prediction===game.result?'text-emerald-400':'text-red-400'}`}>
            {myBet.prediction===game.result ? `WON +${formatCurrency(Math.floor(myBet.amount*1.9))}` : `LOST -${formatCurrency(myBet.amount)}`}
          </p>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Betting */}
      {game?.status==='betting' && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          {!myBet ? <>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {BETS.map(b=> <button key={b} onClick={()=>setBetAmount(b)} className={`py-2 rounded-lg text-sm font-bold border ${betAmount===b?'bg-yellow-500 text-black border-yellow-400':'bg-gray-800 text-gray-300 border-gray-700'}`}>₹{b}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button disabled={placing} onClick={()=>handleBet('ODD')} className="bg-orange-600 hover:bg-orange-500 py-4 rounded-xl font-black text-white disabled:opacity-50">
                ODD <span className="block text-xs opacity-80">₹{oddTotal}</span>
              </button>
              <button disabled={placing} onClick={()=>handleBet('EVEN')} className="bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-black text-white disabled:opacity-50">
                EVEN <span className="block text-xs opacity-80">₹{evenTotal}</span>
              </button>
            </div>
          </> : (
            <div className="text-center py-3">
              <p className="text-gray-400 text-sm">You bet</p>
              <p className={`text-2xl font-black ${myBet.prediction==='ODD'?'text-orange-400':'text-blue-400'}`}>{myBet.prediction} - ₹{myBet.amount}</p>
            </div>
          )}
          <p className="text-center text-xs text-gray-600 mt-3">Balance: {formatCurrency(usable)}</p>
        </div>
      )}

      {/* Live bets */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Users className="w-4 h-4"/> Live Bets ({game?.bets?.length||0})</h3>
        <div className="space-y-1 max-h-24 overflow-y-auto">
          {game?.bets?.map((b,i)=>(
            <div key={i} className="flex justify-between text-xs bg-gray-800/50 px-2 py-1 rounded">
              <span className="text-gray-300">{b.name}</span>
              <span className={b.prediction==='ODD'?'text-orange-400':'text-blue-400'}>{b.prediction} ₹{b.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
