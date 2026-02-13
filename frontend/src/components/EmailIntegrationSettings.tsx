'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { emailIntegration, accounts, type EmailIntegrationItem, type EmailInvoiceItem } from '@/lib/api';

export default function EmailIntegrationSettings() {
  const { t } = useTranslation();
  const [integrations, setIntegrations] = useState<EmailIntegrationItem[]>([]);
  const [invoices, setInvoices] = useState<EmailInvoiceItem[]>([]);
  const [accountsList, setAccountsList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  // Connect form
  const [provider, setProvider] = useState<'gmail' | 'outlook' | 'imap'>('gmail');
  const [connectEmail, setConnectEmail] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [intList, invList, accList] = await Promise.all([
        emailIntegration.list(),
        emailIntegration.invoices('pending'),
        accounts.list(),
      ]);
      setIntegrations(intList);
      setInvoices(invList);
      setAccountsList(accList);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectEmail) return;
    setConnecting(true);
    setError('');
    try {
      await emailIntegration.connect({
        provider,
        email: connectEmail,
        ...(provider === 'imap' && { imapHost, imapPort: parseInt(imapPort) || 993 }),
      });
      setShowConnect(false);
      setConnectEmail('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await emailIntegration.disconnect(id);
      await loadData();
    } catch {}
  };

  const handleScan = async (id: string) => {
    setScanning(id);
    try {
      await emailIntegration.scan(id);
      await loadData();
    } catch {}
    setScanning(null);
  };

  const handleApprove = async (invoiceId: string, accountId: string) => {
    try {
      await emailIntegration.approveInvoice(invoiceId, { accountId });
      setInvoices((prev) => prev.filter((i) => i.id !== invoiceId));
    } catch {}
  };

  const handleDismiss = async (invoiceId: string) => {
    try {
      await emailIntegration.dismissInvoice(invoiceId);
      setInvoices((prev) => prev.filter((i) => i.id !== invoiceId));
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-lg flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-500">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            {t('emailIntegration.title')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('emailIntegration.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowConnect(true)}
          className="btn-primary text-sm"
        >
          {t('emailIntegration.connectEmail')}
        </button>
      </div>

      {/* Connect form */}
      {showConnect && (
        <div className="card border-2 border-primary-200 dark:border-primary-800/50 animate-fadeIn">
          <form onSubmit={handleConnect} className="space-y-4">
            <h3 className="font-medium">{t('emailIntegration.connectNew')}</h3>

            {/* Provider selection */}
            <div className="flex gap-2">
              {(['gmail', 'outlook', 'imap'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors border ${
                    provider === p
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                      : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t(`emailIntegration.${p}`)}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('emailIntegration.emailAddress')}</label>
              <input
                type="email"
                className="input"
                value={connectEmail}
                onChange={(e) => setConnectEmail(e.target.value)}
                placeholder="example@gmail.com"
                required
              />
            </div>

            {provider === 'imap' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('emailIntegration.imapHost')}</label>
                  <input
                    className="input"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    placeholder="imap.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('emailIntegration.imapPort')}</label>
                  <input
                    type="number"
                    className="input"
                    value={imapPort}
                    onChange={(e) => setImapPort(e.target.value)}
                    placeholder="993"
                  />
                </div>
              </div>
            )}

            {provider === 'gmail' && (
              <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                {t('emailIntegration.gmailNote')}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                className="btn-primary text-sm"
                disabled={connecting}
              >
                {connecting ? t('common.loading') : t('emailIntegration.connect')}
              </button>
              <button
                type="button"
                onClick={() => { setShowConnect(false); setError(''); }}
                className="btn-secondary text-sm"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Connected accounts */}
      {integrations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-500">{t('emailIntegration.connectedAccounts')}</h3>
          {integrations.map((intg) => (
            <div key={intg.id} className="card flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${
                intg.provider === 'gmail' ? 'bg-red-500' : intg.provider === 'outlook' ? 'bg-blue-500' : 'bg-slate-500'
              }`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{intg.email}</p>
                <p className="text-xs text-slate-500">
                  {intg.provider.toUpperCase()} · {intg._count.invoices} {t('emailIntegration.invoicesFound')}
                  {intg.lastSyncAt && ` · ${t('emailIntegration.lastSync')}: ${new Date(intg.lastSyncAt).toLocaleDateString()}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleScan(intg.id)}
                disabled={scanning === intg.id}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
              >
                {scanning === intg.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                    {t('emailIntegration.scanning')}
                  </span>
                ) : (
                  t('emailIntegration.scan')
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDisconnect(intg.id)}
                className="text-sm text-red-500 hover:text-red-700 px-2 py-1"
              >
                {t('emailIntegration.disconnect')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending invoices */}
      {invoices.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-500">{t('emailIntegration.pendingInvoices')}</h3>
          {invoices.map((inv) => (
            <div key={inv.id} className="card space-y-3">
              <div className="flex items-start gap-3">
                <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                  inv.extractedType === 'income'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-600'
                }`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inv.emailSubject}</p>
                  <p className="text-xs text-slate-500">
                    {inv.emailFrom} · {new Date(inv.emailDate).toLocaleDateString()}
                  </p>
                  {inv.extractedAmount && (
                    <p className={`text-lg font-bold mt-1 ${inv.extractedType === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {inv.extractedType === 'income' ? '+' : '-'}
                      {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Math.abs(inv.extractedAmount))}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="input flex-1 text-sm"
                  id={`account-${inv.id}`}
                  defaultValue={accountsList[0]?.id || ''}
                >
                  {accountsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const select = document.getElementById(`account-${inv.id}`) as HTMLSelectElement;
                    handleApprove(inv.id, select.value);
                  }}
                  className="text-sm px-3 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                >
                  {t('emailIntegration.approve')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDismiss(inv.id)}
                  className="text-sm px-3 py-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('emailIntegration.dismiss')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {integrations.length === 0 && !showConnect && (
        <div className="text-center py-8">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 text-slate-300 dark:text-slate-600">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <p className="text-sm text-slate-500">{t('emailIntegration.noConnections')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('emailIntegration.noConnectionsHint')}</p>
        </div>
      )}
    </div>
  );
}
