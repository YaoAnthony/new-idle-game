/**
 * useGameAuth — 从 Redux 读取 accessToken，解码出 userId / displayName。
 * 返回稳定的 ref 供 Phaser 闭包使用，避免 stale-closure 问题。
 */

import { useMemo, useRef } from 'react';
import { useSelector }     from 'react-redux';
import type { RootState }  from '../../../../../Redux/store';

export function useGameAuth() {
  const accessToken = useSelector(
    (s: RootState) => (s as any).user?.accessToken as string | null ?? null,
  );

  /** Ref 供 Phaser 回调使用（始终指向最新 token）。 */
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = accessToken;

  const { userId, myDisplayName } = useMemo(() => {
    if (!accessToken) return { userId: null as string | null, myDisplayName: '玩家' };
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      const dn = (payload.email as string | undefined)?.split('@')[0] ?? '玩家';
      return { userId: payload.id as string, myDisplayName: dn };
    } catch {
      return { userId: null as string | null, myDisplayName: '玩家' };
    }
  }, [accessToken]);

  const myDisplayNameRef = useRef(myDisplayName);
  myDisplayNameRef.current = myDisplayName;

  return { accessToken, tokenRef, userId, myDisplayName, myDisplayNameRef };
}
