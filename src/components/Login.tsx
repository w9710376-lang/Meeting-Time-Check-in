import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserAccount } from '../types';
import { Lock, Shield, Building2, QrCode, Eye, EyeOff, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';

export function Login() {
  const { accounts, loginWithAccount } = useAuth();
  const activeAccounts = accounts.filter((a) => a.isActive);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    activeAccounts[0]?.id || 'super-admin'
  );
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'super_admin' | 'dept_manager' | 'qr_kiosk'>('ALL');

  const selectedAccount =
    activeAccounts.find((a) => a.id === selectedAccountId) || activeAccounts[0];

  const filteredAccounts = activeAccounts.filter((acc) =>
    roleFilter === 'ALL' ? true : acc.appRole === roleFilter
  );

  const handleSelectAccount = (acc: UserAccount) => {
    setSelectedAccountId(acc.id);
    setPin('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    if (!pin.trim()) {
      setError('กรุณากรอกรหัส PIN / รหัสผ่าน');
      return;
    }

    setSubmitting(true);
    setError('');
    const result = await loginWithAccount(selectedAccount.id, pin);
    if (!result.success) {
      setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ');
    }
    setSubmitting(false);
  };

  const handleQuickDigit = (digit: string) => {
    setError('');
    setPin((prev) => (prev.length < 12 ? prev + digit : prev));
  };

  const getRoleLabel = (appRole: UserAccount['appRole']) => {
    if (appRole === 'super_admin') return 'Super Admin · จัดการทุกแผนก & ตั้งค่า Role';
    if (appRole === 'dept_manager') return 'Department Manager · หัวหน้าประจำแผนก';
    return 'QR Display Kiosk · สำหรับเปิดหน้าจอสแกน QR';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-900 flex flex-col justify-center items-center p-4 md:p-8">
      <div className="w-full max-w-5xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Column: Account & Role Selector */}
        <div className="lg:col-span-7 p-6 md:p-8 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                M
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Meeting Time Check-in
                </h1>
                <p className="text-xs text-slate-500">
                  ระบบเข้าสู่ระบบสำหรับผู้ดูแลระบบและหัวหน้าแผนก (IE · EE · ME · MES · MER)
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="mt-5 mb-4 flex flex-wrap gap-1.5 bg-slate-200/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setRoleFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  roleFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทั้งหมด ({activeAccounts.length})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('super_admin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  roleFilter === 'super_admin'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Super Admin
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('dept_manager')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  roleFilter === 'dept_manager'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                หัวหน้าแผนก (IE-MER)
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('qr_kiosk')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  roleFilter === 'qr_kiosk'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                หน้าจอ QR Kiosk
              </button>
            </div>

            {/* Accounts List */}
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {filteredAccounts.map((acc) => {
                const isSelected = selectedAccount?.id === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleSelectAccount(acc)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-blue-400 hover:bg-blue-50/40'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : acc.appRole === 'super_admin'
                            ? 'bg-slate-900 text-white'
                            : acc.appRole === 'dept_manager'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {acc.appRole === 'super_admin' ? (
                          <Shield className="w-5 h-5" />
                        ) : acc.appRole === 'dept_manager' ? (
                          <Building2 className="w-5 h-5" />
                        ) : (
                          <QrCode className="w-5 h-5" />
                        )}
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-sm truncate">{acc.name}</div>
                        <div
                          className={`text-xs truncate mt-0.5 ${
                            isSelected ? 'text-blue-100' : 'text-slate-500'
                          }`}
                        >
                          {getRoleLabel(acc.appRole)}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md flex-shrink-0 ml-2 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {acc.departmentScope === 'ALL' ? 'ทุกแผนก' : `แผนก ${acc.departmentScope}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Info Footer for Employees */}
          <div className="mt-6 pt-4 border-t border-slate-200 flex items-start space-x-2.5 text-xs text-slate-500">
            <QrCode className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>สำหรับพนักงานทั่วไป:</strong> ไม่ต้องเข้าสู่ระบบในหน้านี้ สามารถใช้กล้องมือถือสแกน QR Code ประจำแผนกเพื่อเช็คอินได้ทันที
            </span>
          </div>
        </div>

        {/* Right Column: PIN / Password Entry */}
        <div className="lg:col-span-5 p-6 md:p-8 flex flex-col justify-between bg-white">
          {selectedAccount ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <div className="text-xs font-semibold text-blue-600">
                  บัญชีที่เลือกเข้าใช้งาน
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {selectedAccount.name}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  ขอบเขตการเข้าถึง:{' '}
                  <span className="font-semibold text-slate-700">
                    {selectedAccount.departmentScope === 'ALL'
                      ? 'ทุกแผนก (IE, EE, ME, MES, MER)'
                      : `เฉพาะแผนก ${selectedAccount.departmentScope}`}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  รหัสผ่าน / PIN เข้าสู่ระบบ
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => {
                      setError('');
                      setPin(e.target.value);
                    }}
                    placeholder="กรอกรหัส PIN (เช่น 1234)"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-base tracking-widest focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    title={showPin ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {error && (
                  <div className="mt-2.5 flex items-center space-x-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Numeric Keypad for fast touch / kiosk entry */}
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleQuickDigit(digit)}
                    className="py-2.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 text-sm transition-colors tabular-nums"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPin('');
                    setError('');
                  }}
                  className="py-2.5 bg-slate-50 hover:bg-rose-50 text-rose-600 border border-slate-200 rounded-xl font-semibold text-xs transition-colors"
                >
                  ล้างค่า
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDigit('0')}
                  className="py-2.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 text-sm transition-colors tabular-nums"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPin((prev) => prev.slice(0, -1))}
                  className="py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-semibold text-xs transition-colors"
                >
                  ลบ ⌫
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-2"
              >
                <span>เข้าสู่ระบบ</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : null}

          {/* Quick PIN Helper for initial setup */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{showHint ? 'ซ่อนรหัส PIN เริ่มต้น' : 'ดูรหัส PIN เริ่มต้น (สามารถเปลี่ยนได้ในหน้าตั้งค่า Role)'}</span>
            </button>

            {showHint && selectedAccount && (
              <div className="mt-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">รหัสปัจจุบันของ <strong>{selectedAccount.name}</strong>:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPin(selectedAccount.pin);
                      setError('');
                    }}
                    className="font-mono font-bold text-blue-600 hover:underline px-2 py-0.5 bg-blue-50 rounded"
                  >
                    {selectedAccount.pin} (คลิกเพื่อกรอก)
                  </button>
                </div>
                <p className="text-slate-400 text-[11px]">
                  *เมื่อเข้าสู่ระบบด้วย Super Admin แล้ว สามารถไปที่เมนู &ldquo;ตั้งค่า Role / สิทธิ์&rdquo; เพื่อเปลี่ยนรหัสผ่านหรือเพิ่มบัญชีใหม่ได้ทันที
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
