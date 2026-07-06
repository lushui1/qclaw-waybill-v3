'use client';

import { useState, useEffect } from 'react';

export default function UserSwitcher() {
  const [users, setUsers] = useState<any[]>([]);
  const [currentId, setCurrentId] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('currentUser');
    fetch('/api/users').then(r => r.json()).then(list => {
      setUsers(list);
      if (saved && list.find((u: any) => u.id === saved)) {
        setCurrentId(saved);
      } else if (list.length > 0) {
        setCurrentId(list[0].id);
        localStorage.setItem('currentUser', list[0].id);
      }
    }).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setCurrentId(id);
    localStorage.setItem('currentUser', id);
  };

  return (
    <select className="input" value={currentId} onChange={handleChange}
      style={{ maxWidth: 180, fontSize: 13, height: 32 }}>
      <option value="">切换角色</option>
      {users.map((u: any) => (
        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
      ))}
    </select>
  );
}
