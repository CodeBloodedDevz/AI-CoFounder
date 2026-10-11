import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayISO } from '../lib/schedule';

// Remembers when you last messaged each customer (on this device), so the
// "Customers to follow up" list doesn't keep nagging about people you've
// just contacted. Reloads whenever the screen comes back into focus.
const KEY = 'ai-cofounder-contacted-v1';

async function read() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function useContactLog(navigation) {
  const [contacted, setContacted] = useState({});

  const reload = useCallback(() => {
    read().then(setContacted);
  }, []);

  useEffect(() => {
    reload();
    return navigation?.addListener ? navigation.addListener('focus', reload) : undefined;
  }, [navigation, reload]);

  const markContacted = useCallback(async (customerId) => {
    const next = { ...(await read()), [customerId]: todayISO() };
    setContacted(next);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      // storage unavailable: the list just won't remember
    }
  }, []);

  return { contacted, markContacted };
}
