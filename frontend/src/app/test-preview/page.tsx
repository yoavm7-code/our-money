'use client';

import { useState } from 'react';

/* ─── MOCK DATA ─── */
const MOCK_TRANSACTIONS = [
  { id: '1', date: '2026-02-10', description: 'Supermarket', amount: -245.90, category: 'Groceries', account: 'Bank Hapoalim' },
  { id: '2', date: '2026-02-09', description: 'Salary', amount: 15000, category: 'Salary', account: 'Bank Hapoalim' },
  { id: '3', date: '2026-02-08', description: 'Electric bill', amount: -380, category: 'Utilities', account: 'Credit Card' },
  { id: '4', date: '2026-02-07', description: 'Netflix', amount: -49.90, category: 'Subscriptions', account: 'Credit Card' },
  { id: '5', date: '2026-02-06', description: 'Freelance project', amount: 3200, category: 'Income', account: 'Bank Leumi' },
  { id: '6', date: '2026-02-05', description: 'Gas station', amount: -320, category: 'Transport', account: 'Credit Card' },
];

const MOCK_PIE_DATA = [
  { name: 'Groceries', value: 2450, color: '#22c55e' },
  { name: 'Utilities', value: 1200, color: '#f59e0b' },
  { name: 'Transport', value: 980, color: '#3b82f6' },
  { name: 'Subscriptions', value: 350, color: '#f43f5e' },
  { name: 'Dining', value: 720, color: '#f97316' },
  { name: 'Shopping', value: 540, color: '#a855f7' },
];

const PAGES = [
  { path: '/login', label: 'Login / Register' },
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/transactions', label: 'Transactions' },
  { path: '/upload', label: 'Upload Documents' },
  { path: '/income', label: 'Income' },
  { path: '/expenses', label: 'Expenses' },
  { path: '/goals', label: 'Goals' },
  { path: '/budgets', label: 'Budgets' },
  { path: '/recurring', label: 'Recurring' },
  { path: '/loans-savings', label: 'Loans & Savings' },
  { path: '/insurance-funds', label: 'Insurance & Funds' },
  { path: '/forex', label: 'Forex' },
  { path: '/insights', label: 'Insights' },
  { path: '/reports', label: 'Reports' },
  { path: '/settings', label: 'Settings' },
  { path: '/verify-email?token=test', label: 'Verify Email' },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IL', { style: 'currency', currency: 'ILS' }).format(n);
}

/* ─── COMPONENTS ─── */

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-start"
      >
        <span className="text-lg font-semibold">{title}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {open && <div className="p-5 space-y-4">{children}</div>}
    </div>
  );
}

function StatCard({ label, value, trend, color }: { label: string; value: string; trend?: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4" style={{ borderTopColor: color, borderTopWidth: 3 }}>
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {trend && <p className={`text-xs mt-1 ${trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>{trend}</p>}
    </div>
  );
}

function SimplePieChart({ data }: { data: typeof MOCK_PIE_DATA }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumPercent = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 32 32" className="w-32 h-32 shrink-0" style={{ transform: 'rotate(-90deg)' }}>
        {data.map((d, i) => {
          const percent = d.value / total;
          const strokeDasharray = `${percent * 100} ${100 - percent * 100}`;
          const strokeDashoffset = -(cumPercent * 100);
          cumPercent += percent;
          return (
            <circle
              key={i}
              r="15.9"
              cx="16"
              cy="16"
              fill="transparent"
              stroke={d.color}
              strokeWidth="3"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
            />
          );
        })}
      </svg>
      <div className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span>{d.name}</span>
            <span className="text-slate-400 ms-auto">{formatCurrency(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleBarChart() {
  const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
  const income = [12000, 13500, 12000, 14000, 15200, 15000];
  const expenses = [9500, 10200, 11000, 9800, 10500, 8900];
  const maxVal = Math.max(...income, ...expenses);

  return (
    <div className="flex items-end gap-2 h-40">
      {months.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end gap-0.5 justify-center" style={{ height: 120 }}>
            <div className="w-3 rounded-t bg-green-500" style={{ height: `${(income[i] / maxVal) * 100}%` }} title={`Income: ${formatCurrency(income[i])}`} />
            <div className="w-3 rounded-t bg-red-400" style={{ height: `${(expenses[i] / maxVal) * 100}%` }} title={`Expenses: ${formatCurrency(expenses[i])}`} />
          </div>
          <span className="text-xs text-slate-400">{m}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── MAIN PAGE ─── */

export default function TestPreviewPage() {
  const [activeTab, setActiveTab] = useState<'status' | 'dashboard' | 'components'>('status');
  const buildTime = new Date().toISOString();

  const tabs = [
    { id: 'status' as const, label: 'Build Status & Navigation' },
    { id: 'dashboard' as const, label: 'Demo Dashboard' },
    { id: 'components' as const, label: 'UI Components' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold">Our Money</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">TEST PREVIEW</span>
          </div>
          <span className="text-xs text-slate-400">{buildTime}</span>
        </div>
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* ─── TAB 1: BUILD STATUS ─── */}
        {activeTab === 'status' && (
          <div className="space-y-6 animate-fadeIn">
            <Section title="Build Info">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 text-center">
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Status</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">OK</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Framework</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">Next.js 16</p>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 p-3 text-center">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">React</p>
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">18</p>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 p-3 text-center">
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-1">Generated</p>
                  <p className="text-sm font-bold text-orange-700 dark:text-orange-300">{new Date().toLocaleString()}</p>
                </div>
              </div>
            </Section>

            <Section title="All Pages (Navigation Test)">
              <p className="text-sm text-slate-500 mb-3">Click any link to test that the page loads. Pages requiring auth will redirect to login.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {PAGES.map((p) => (
                  <a
                    key={p.path}
                    href={p.path}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 shrink-0">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                    {p.label}
                  </a>
                ))}
              </div>
            </Section>

            <Section title="Environment">
              <div className="font-mono text-xs bg-slate-900 text-green-400 rounded-lg p-4 space-y-1 overflow-x-auto">
                <p>NODE_ENV = production</p>
                <p>NEXT_PUBLIC_API_URL = {typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '(not set - using rewrites)') : '...'}</p>
                <p>Build timestamp = {buildTime}</p>
                <p>User agent = {typeof window !== 'undefined' ? navigator.userAgent.slice(0, 80) + '...' : '...'}</p>
              </div>
            </Section>
          </div>
        )}

        {/* ─── TAB 2: DEMO DASHBOARD ─── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            <p className="text-sm text-slate-500">This is a demo with hardcoded data. No API calls are made.</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Balance" value={formatCurrency(45230)} trend="+2.4% from last month" color="#3b82f6" />
              <StatCard label="Income (Feb)" value={formatCurrency(18200)} trend="+15% from Jan" color="#22c55e" />
              <StatCard label="Expenses (Feb)" value={formatCurrency(8900)} trend="-12% from Jan" color="#ef4444" />
              <StatCard label="Net Savings" value={formatCurrency(9300)} color="#8b5cf6" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Section title="Spending by Category">
                <SimplePieChart data={MOCK_PIE_DATA} />
              </Section>

              <Section title="Income vs Expenses (6 months)">
                <SimpleBarChart />
                <div className="flex gap-4 text-xs text-slate-500 mt-2">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Income</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Expenses</span>
                </div>
              </Section>
            </div>

            <Section title="Recent Transactions">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                      <th className="text-start py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="text-start py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                      <th className="text-start py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                      <th className="text-start py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Account</th>
                      <th className="text-end py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_TRANSACTIONS.map((tx) => (
                      <tr key={tx.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 px-3 text-slate-500">{new Date(tx.date).toLocaleDateString()}</td>
                        <td className="py-2.5 px-3 font-medium">{tx.description}</td>
                        <td className="py-2.5 px-3 text-slate-500">{tx.category}</td>
                        <td className="py-2.5 px-3 text-slate-500">{tx.account}</td>
                        <td className={`py-2.5 px-3 text-end font-semibold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Goals">
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { name: 'Vacation Fund', current: 8500, target: 15000, icon: '✈️', color: '#3b82f6' },
                  { name: 'Emergency Fund', current: 22000, target: 30000, icon: '🛡️', color: '#22c55e' },
                  { name: 'New Car', current: 45000, target: 120000, icon: '🚗', color: '#f59e0b' },
                ].map((g, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{g.icon}</span>
                      <span className="font-medium">{g.name}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                      <div className="h-full rounded-full" style={{ width: `${(g.current / g.target) * 100}%`, backgroundColor: g.color }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{formatCurrency(g.current)}</span>
                      <span>{formatCurrency(g.target)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* ─── TAB 3: UI COMPONENTS ─── */}
        {activeTab === 'components' && (
          <div className="space-y-6 animate-fadeIn">
            <p className="text-sm text-slate-500">Visual reference for all UI components used across the app.</p>

            <Section title="Buttons">
              <div className="flex flex-wrap gap-3 items-center">
                <button type="button" className="btn-primary">Primary</button>
                <button type="button" className="btn-secondary">Secondary</button>
                <button type="button" className="btn-primary" disabled>Disabled</button>
                <button type="button" className="btn-primary bg-red-600 hover:bg-red-700">Danger</button>
                <button type="button" className="btn-primary bg-green-600 hover:bg-green-700">Success</button>
                <button type="button" className="text-sm text-primary-600 hover:underline">Text Link</button>
              </div>
            </Section>

            <Section title="Form Inputs">
              <div className="grid md:grid-cols-2 gap-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium mb-1">Text Input</label>
                  <input type="text" className="input w-full" placeholder="Enter text..." />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Number Input</label>
                  <input type="number" className="input w-full" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Select</label>
                  <select className="input w-full">
                    <option>Option 1</option>
                    <option>Option 2</option>
                    <option>Option 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input type="date" className="input w-full" defaultValue="2026-02-11" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="demo-check" className="rounded" defaultChecked />
                  <label htmlFor="demo-check" className="text-sm">Checkbox</label>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Search</label>
                  <input type="search" className="input w-full" placeholder="Search..." />
                </div>
              </div>
            </Section>

            <Section title="Cards & Alerts">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="card p-4">
                  <h3 className="font-medium mb-2">Default Card</h3>
                  <p className="text-sm text-slate-500">Standard card with border and shadow.</p>
                </div>
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-green-700 dark:text-green-300">
                  Success alert: Operation completed.
                </div>
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300">
                  Error alert: Something went wrong.
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4 text-amber-700 dark:text-amber-300">
                  Warning alert: Check your data.
                </div>
              </div>
            </Section>

            <Section title="Typography">
              <div className="space-y-3">
                <h1 className="text-3xl font-bold">Heading 1 (3xl bold)</h1>
                <h2 className="text-2xl font-semibold">Heading 2 (2xl semibold)</h2>
                <h3 className="text-xl font-medium">Heading 3 (xl medium)</h3>
                <p className="text-base">Body text (base) - Regular paragraph text used throughout the app.</p>
                <p className="text-sm text-slate-500">Small text (sm slate-500) - Used for hints and secondary info.</p>
                <p className="text-xs text-slate-400">Extra small (xs slate-400) - Used for timestamps and metadata.</p>
                <p className="font-mono text-sm bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block">Monospace code</p>
              </div>
            </Section>

            <Section title="Colors">
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Primary', class: 'bg-primary-500' },
                  { name: 'Green', class: 'bg-green-500' },
                  { name: 'Red', class: 'bg-red-500' },
                  { name: 'Yellow', class: 'bg-amber-500' },
                  { name: 'Blue', class: 'bg-blue-500' },
                  { name: 'Purple', class: 'bg-purple-500' },
                  { name: 'Orange', class: 'bg-orange-500' },
                  { name: 'Cyan', class: 'bg-cyan-500' },
                  { name: 'Pink', class: 'bg-pink-500' },
                  { name: 'Slate', class: 'bg-slate-500' },
                ].map((c) => (
                  <div key={c.name} className="flex flex-col items-center gap-1">
                    <div className={`w-10 h-10 rounded-lg ${c.class}`} />
                    <span className="text-xs text-slate-500">{c.name}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Table">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                      <th className="text-start py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Column 1</th>
                      <th className="text-start py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Column 2</th>
                      <th className="text-end py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3].map((row) => (
                      <tr key={row} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 px-3">Row {row} data</td>
                        <td className="py-2.5 px-3 text-slate-500">Secondary info</td>
                        <td className="py-2.5 px-3 text-end font-semibold text-green-600">+{formatCurrency(row * 1000)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button type="button" className="text-primary-600 hover:underline text-xs me-2">Edit</button>
                          <button type="button" className="text-red-600 hover:underline text-xs">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Loading & Empty States">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex flex-col items-center gap-2 py-6 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                  <span className="text-sm text-slate-500">Loading spinner</span>
                </div>
                <div className="flex flex-col items-center gap-2 py-6 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                  </svg>
                  <span className="text-sm text-slate-500">No data yet</span>
                </div>
                <div className="flex flex-col items-center gap-2 py-6 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-500">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span className="text-sm text-green-600">Success state</span>
                </div>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
