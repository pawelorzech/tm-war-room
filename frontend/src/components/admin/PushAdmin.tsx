'use client';

import { useState } from 'react';
import { SendNotification } from './push/SendNotification';
import { TemplateManager } from './push/TemplateManager';
import { GroupManager } from './push/GroupManager';
import { PushHistory } from './push/PushHistory';

type SubTab = 'send' | 'templates' | 'groups' | 'history';

interface PushAdminProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function PushAdmin({ adminFetch }: PushAdminProps) {
  const [subTab, setSubTab] = useState<SubTab>('send');

  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'send', label: 'Send' },
    { id: 'templates', label: 'Templates' },
    { id: 'groups', label: 'Groups' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div>
      <div className="flex gap-3 mb-4">
        {subTabs.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              subTab === t.id
                ? 'bg-torn-green/15 text-torn-green'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'send' && <SendNotification adminFetch={adminFetch} />}
      {subTab === 'templates' && <TemplateManager adminFetch={adminFetch} />}
      {subTab === 'groups' && <GroupManager adminFetch={adminFetch} />}
      {subTab === 'history' && <PushHistory adminFetch={adminFetch} />}
    </div>
  );
}
