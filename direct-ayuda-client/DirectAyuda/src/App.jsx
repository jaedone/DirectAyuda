import { useState, useEffect, useCallback } from "react";
import {
  connectWallet,
  claimSubsidy,
  checkHasClaimed,
  getAuditLog,
  getTotalFunds,
  getTotalDisbursed,
  getCurrentCycle,
  getBeneficiary,
  getConfig,
  fundContract,
  registerBeneficiary,
} from "./stellar";

// ─────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────
const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z"/>
    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const WalletIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 14a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" fill="currentColor" stroke="none"/>
    <path d="M2 10h20M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>
  </svg>
);
const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);
const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const SpinnerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const ExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const HOW_IT_WORKS = [
  { step: "01", title: "Government Funds Contract", desc: "The LGU or DSWD deposits subsidy tokens directly into the AyudaDirect smart contract on the Stellar blockchain." },
  { step: "02", title: "Citizen is Registered", desc: "Eligible seniors and PWDs are registered with a fixed entitlement — locked on-chain. No one can change the amount." },
  { step: "03", title: "Claim Your Subsidy", desc: "Connect your Freighter wallet and claim. The contract sends exactly your registered amount — instant, automatic, auditable." },
  { step: "04", title: "Full Audit Trail", desc: "Every disbursement is permanently recorded on-chain. Citizens, media, and watchdogs can verify every peso, anytime." },
];

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
function StatCard({ label, value, sub, loading }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: "1.5rem" }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em", minHeight: 36 }}>
        {loading ? <span style={{ color: "#4b5563", fontSize: 14 }}>loading…</span> : value}
      </div>
      <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 6, fontWeight: 500 }}>{sub}</div>
    </div>
  );
}

function HowStep({ step, title, desc, index }) {
  return (
    <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start", animation: "fadeUp 0.5s ease both", animationDelay: `${index * 0.1}s` }}>
      <div style={{ minWidth: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#c4b5fd", fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em", flexShrink: 0 }}>
        {step}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#f3f4f6", marginBottom: 5 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7 }}>{desc}</div>
      </div>
    </div>
  );
}

function AuditRow({ record }) {
  const short = (addr) => addr ? `${addr.slice(0, 5)}…${addr.slice(-5)}` : "—";
  const ts = record.timestamp ? new Date(Number(record.timestamp) * 1000).toLocaleString() : "—";
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <td style={{ padding: "0.7rem 1rem", fontSize: 13, color: "#9ca3af", fontFamily: "'DM Mono', monospace" }}>{String(record.cycle)}</td>
      <td style={{ padding: "0.7rem 1rem", fontSize: 13, color: "#e5e7eb" }}>{record.beneficiary_name || "—"}</td>
      <td style={{ padding: "0.7rem 1rem", fontSize: 13, color: "#a78bfa", fontFamily: "'DM Mono', monospace" }}>{short(record.beneficiary)}</td>
      <td style={{ padding: "0.7rem 1rem", fontSize: 13, color: "#34d399", fontWeight: 600 }}>₱{Number(record.amount).toLocaleString()}</td>
      <td style={{ padding: "0.7rem 1rem", fontSize: 12, color: "#6b7280" }}>{ts}</td>
    </tr>
  );
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
export default function App() {
  // Wallet state
  const [walletAddress, setWalletAddress] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState(null);

  // Claim state
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);

  // Contract data state
  const [statsLoading, setStatsLoading] = useState(false);
  const [totalFunds, setTotalFunds] = useState(null);
  const [totalDisbursed, setTotalDisbursed] = useState(null);
  const [currentCycle, setCurrentCycle] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [beneficiaryRecord, setBeneficiaryRecord] = useState(null);
  const [eligibilityError, setEligibilityError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminFundAmount, setAdminFundAmount] = useState("");
  const [adminFunding, setAdminFunding] = useState(false);
  const [adminFundError, setAdminFundError] = useState(null);
  const [adminFundSuccess, setAdminFundSuccess] = useState(false);

  const [regAddress, setRegAddress] = useState("");
  const [regName, setRegName] = useState("");
  const [regEntitlement, setRegEntitlement] = useState("");
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState(null);
  const [regSuccess, setRegSuccess] = useState(false);

  // ── FIX 1: Load stats on mount ──────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [funds, disbursed, cycle] = await Promise.all([
        getTotalFunds(),
        getTotalDisbursed(),
        getCurrentCycle(),
      ]);
      setTotalFunds(funds);
      setTotalDisbursed(disbursed);
      setCurrentCycle(cycle);
    } catch {
      // silently fail — testnet may be slow
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── FIX 2: Audit log uses Horizon events ────
  const loadAuditLog = useCallback(async () => {
    setAuditLoading(true);
    try {
      const log = await getAuditLog();
      setAuditLog(log || []);
    } catch {
      setAuditLog([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuditLog();
  }, [loadAuditLog]);

  // Check admin status when wallet connects
  useEffect(() => {
    if (!walletAddress) { setIsAdmin(false); return; }
    getConfig()
      .then((config) => setIsAdmin(config.admin === walletAddress))
      .catch(() => setIsAdmin(false));
  }, [walletAddress]);

  // Check beneficiary registration when wallet connects
  useEffect(() => {
    if (!walletAddress) return;
    setEligibilityError(null);
    setBeneficiaryRecord(null);
    getBeneficiary(walletAddress)
      .then((record) => {
        setBeneficiaryRecord(record);
        if (!record?.active) {
          setEligibilityError("This wallet is registered but inactive.");
        }
      })
      .catch(() => {
        setEligibilityError("This wallet is not a registered beneficiary.");
      });
  }, [walletAddress]);

  // ── FIX 3: Check alreadyClaimed when wallet + cycle are ready ──
  useEffect(() => {
    if (!walletAddress || currentCycle === null) return;
    checkHasClaimed(walletAddress, currentCycle)
      .then(setAlreadyClaimed)
      .catch(() => setAlreadyClaimed(false));
  }, [walletAddress, currentCycle]);

  // Connect Freighter wallet
  async function handleConnectWallet() {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const address = await connectWallet();
      if (address) setWalletAddress(address);
    } catch (e) {
      setWalletError(e.message || "Could not connect wallet. Make sure Freighter is installed and set to Testnet.");
    } finally {
      setWalletLoading(false);
    }
  }

  // Claim subsidy
  async function handleClaim() {
    if (!walletAddress) {
      setClaimError("Connect your Freighter wallet first.");
      return;
    }
    if (eligibilityError) {
      setClaimError(eligibilityError);
      return;
    }
    if (!beneficiaryRecord) {
      setClaimError("Could not verify beneficiary registration.");
      return;
    }

    setClaiming(true);
    setClaimError(null);

    try {
      const result = await claimSubsidy(walletAddress);
      if (result?.hash) setTxHash(result.hash);
      setClaimed(true);
      setAlreadyClaimed(true);
      await Promise.all([loadStats(), loadAuditLog()]);
    } catch (e) {
      setClaimError(e.message || "Transaction failed. Please try again.");
    } finally {
      setClaiming(false);
    }
  }

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 5)}…${walletAddress.slice(-5)}`
    : null;

  // ── FIX 4: Hero card shows real entitlement when wallet connected ──
  const heroEntitlement =
    walletAddress && beneficiaryRecord?.entitlement
      ? Number(beneficiaryRecord.entitlement).toLocaleString()
      : "1,000";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #080810; color: #f3f4f6; font-family: 'DM Sans', sans-serif; }
        @keyframes fadeUp   { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin     { to { transform: rotate(360deg); } }
        @keyframes pulse    { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes float    { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-10px); } }
        .btn-primary {
          display:inline-flex; align-items:center; gap:8px;
          background: linear-gradient(135deg,#7c3aed,#4f46e5);
          color:#fff; border:none; border-radius:10px;
          padding:0.7rem 1.4rem; font-size:14px; font-weight:600;
          cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif;
          white-space:nowrap; text-decoration:none;
        }
        .btn-primary:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 28px rgba(124,58,237,0.45); }
        .btn-primary:disabled { opacity:0.55; cursor:not-allowed; }
        .btn-outline {
          display:inline-flex; align-items:center; gap:8px;
          background:transparent; color:#c4b5fd;
          border:1px solid rgba(196,181,253,0.28); border-radius:10px;
          padding:0.7rem 1.4rem; font-size:14px; font-weight:500;
          cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif;
        }
        .btn-outline:hover { background:rgba(124,58,237,0.1); border-color:rgba(196,181,253,0.55); }
        .nav-link { color:#9ca3af; text-decoration:none; font-size:14px; font-weight:500; transition:color 0.2s; }
        .nav-link:hover { color:#c4b5fd; }
        .feature-card {
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.07);
          border-radius:20px; padding:1.5rem;
          transition:border-color 0.25s, transform 0.25s;
        }
        .feature-card:hover { border-color:rgba(124,58,237,0.4); transform:translateY(-4px); }
        .error-box {
          display:flex; align-items:flex-start; gap:8px;
          background:rgba(239,68,68,0.08);
          border:1px solid rgba(239,68,68,0.25);
          border-radius:10px; padding:0.85rem 1rem;
          font-size:13px; color:#fca5a5; margin-top:0.75rem;
        }
        .orb { position:absolute; border-radius:50%; filter:blur(90px); pointer-events:none; }
        .audit-table { width:100%; border-collapse:collapse; }
        .audit-table th { padding:0.6rem 1rem; text-align:left; font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.07em; border-bottom:1px solid rgba(255,255,255,0.07); }
        .audit-table tr:hover td { background:rgba(124,58,237,0.05); }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{ position:"sticky", top:0, zIndex:100, background:"rgba(8,8,16,0.9)", backdropFilter:"blur(18px)", borderBottom:"1px solid rgba(255,255,255,0.05)", padding:"0 2rem" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", height:62, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:32, height:32, borderRadius:9, background:"linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", color:"#e9d5ff" }}>
              <ShieldIcon />
            </div>
            <span style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:17, color:"#fff" }}>
              Ayuda<span style={{ color:"#a78bfa" }}>Direct</span>
            </span>
          </div>

          <div style={{ display:"flex", gap:"2rem" }}>
            <a href="#how" className="nav-link">How It Works</a>
            <a href="#stats" className="nav-link">Stats</a>
            <a href="#claim" className="nav-link">Claim</a>
            <a href="#audit" className="nav-link">Audit Log</a>
          </div>

          <button
            className={walletAddress ? "btn-outline" : "btn-primary"}
            onClick={handleConnectWallet}
            disabled={walletLoading}
          >
            {walletLoading ? <SpinnerIcon /> : <WalletIcon />}
            {walletLoading ? "Connecting…" : walletAddress ? shortAddr : "Connect Wallet"}
          </button>
        </div>
        {walletError && (
          <div style={{ maxWidth:1100, margin:"0 auto", paddingBottom:"0.5rem" }}>
            <div className="error-box"><AlertIcon />{walletError}</div>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section style={{ position:"relative", overflow:"hidden", padding:"6rem 2rem 5rem" }}>
        <div className="orb" style={{ width:520, height:520, background:"#7c3aed", top:-160, left:-120, opacity:0.28 }} />
        <div className="orb" style={{ width:380, height:380, background:"#4f46e5", top:80, right:-80, opacity:0.22 }} />

        <div style={{ maxWidth:1100, margin:"0 auto", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4rem", alignItems:"center" }}>
          <div style={{ animation:"fadeUp 0.6s ease both" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(124,58,237,0.12)", border:"1px solid rgba(124,58,237,0.32)", borderRadius:20, padding:"0.3rem 1rem", marginBottom:"1.5rem", fontSize:12, color:"#c4b5fd", fontWeight:500 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#7c3aed", animation:"pulse 2s infinite", display:"inline-block" }} />
              Built on Stellar · Zero Middlemen
            </div>

            <h1 style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"clamp(2rem,4vw,3.2rem)", fontWeight:700, lineHeight:1.15, color:"#fff", marginBottom:"1.25rem", letterSpacing:"-0.025em" }}>
              Government Aid,<br />
              <span style={{ background:"linear-gradient(90deg,#a78bfa,#818cf8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                Delivered Direct.
              </span>
            </h1>

            <p style={{ fontSize:16, color:"#9ca3af", lineHeight:1.8, maxWidth:440, marginBottom:"2rem" }}>
              No processing fees. No intermediaries. No corruption. AyudaDirect sends government subsidies straight to your Stellar wallet — exactly the amount you're owed.
            </p>

            <div style={{ display:"flex", gap:"1rem", flexWrap:"wrap", marginBottom:"2.5rem" }}>
              <button className="btn-primary" onClick={() => document.getElementById("claim")?.scrollIntoView({ behavior:"smooth" })}>
                Claim Your Subsidy <ArrowIcon />
              </button>
              <button className="btn-outline" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior:"smooth" })}>
                How it Works
              </button>
            </div>

            <div style={{ display:"flex", gap:"2.5rem" }}>
              {[["₱0","Processing Fees"],["100%","On-Chain Audit"],["4 sec","Avg Claim Time"]].map(([v,l]) => (
                <div key={l}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontWeight:500, fontSize:20, color:"#a78bfa" }}>{v}</div>
                  <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── FIX 4: Hero card shows real entitlement ── */}
          <div style={{ animation:"float 4s ease-in-out infinite" }}>
            <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(124,58,237,0.28)", borderRadius:24, padding:"2rem", backdropFilter:"blur(16px)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem" }}>
                <div style={{ fontSize:12, color:"#9ca3af", fontWeight:500 }}>
                  Direct Ayuda · Cycle {currentCycle !== null ? currentCycle : "—"}
                </div>
                <div style={{ background:"rgba(16,185,129,0.12)", color:"#34d399", border:"1px solid rgba(52,211,153,0.28)", borderRadius:20, padding:"0.2rem 0.75rem", fontSize:11, fontWeight:600 }}>
                  ● ACTIVE
                </div>
              </div>

              <div style={{ marginBottom:"1.5rem" }}>
                <div style={{ fontSize:11, color:"#6b7280", marginBottom:4, letterSpacing:"0.07em", textTransform:"uppercase", fontWeight:600 }}>YOUR ENTITLEMENT</div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:44, fontWeight:500, color:"#a78bfa", letterSpacing:"-0.02em" }}>₱{heroEntitlement}</div>
                <div style={{ fontSize:13, color:"#9ca3af", marginTop:4 }}>Fixed · Cannot be deducted</div>
              </div>

              <div style={{ background:"rgba(0,0,0,0.25)", borderRadius:12, padding:"1rem", marginBottom:"1.25rem" }}>
                {[
                  ["Registered Amount", `₱${heroEntitlement}`, "#e5e7eb", false],
                  ["Processing Fee", "₱0.00", "#34d399", false],
                  ["You Receive", `₱${heroEntitlement}`, "#a78bfa", true],
                ].map(([label, val, color, bold]) => (
                  <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"0.4rem 0", borderTop: bold ? "1px solid rgba(255,255,255,0.06)" : "none", marginTop: bold ? 8 : 0 }}>
                    <span style={{ fontSize:13, color: bold ? "#e5e7eb" : "#6b7280", fontWeight: bold ? 600 : 400 }}>{label}</span>
                    <span style={{ fontSize:13, color, fontWeight: bold ? 700 : 600 }}>{val}</span>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#34d399" }}>
                <CheckIcon /> Secured by Stellar smart contract
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section id="stats" style={{ padding:"3rem 2rem", borderTop:"1px solid rgba(255,255,255,0.05)", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"1.25rem" }}>
          <StatCard label="Total Funds in Contract" value={totalFunds !== null ? `₱${Number(totalFunds).toLocaleString()}` : "—"} sub="Live from Stellar Testnet" loading={statsLoading} />
          <StatCard label="Total Disbursed" value={totalDisbursed !== null ? `₱${Number(totalDisbursed).toLocaleString()}` : "—"} sub="0% deductions" loading={statsLoading} />
          <StatCard label="Current Cycle" value={currentCycle !== null ? `#${currentCycle}` : "—"} sub="Claim window open" loading={statsLoading} />
          <StatCard label="Audit Entries" value={String(auditLog.length)} sub="On-chain records" loading={auditLoading} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ padding:"5rem 2rem", position:"relative", overflow:"hidden" }}>
        <div className="orb" style={{ width:320, height:320, background:"#4f46e5", bottom:0, right:0, opacity:0.16 }} />
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:"3.5rem" }}>
            <div style={{ fontSize:11, color:"#7c3aed", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 }}>TRANSPARENT BY DESIGN</div>
            <h2 style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"clamp(1.8rem,3vw,2.4rem)", fontWeight:700, color:"#fff", letterSpacing:"-0.025em" }}>How AyudaDirect Works</h2>
            <p style={{ fontSize:15, color:"#9ca3af", marginTop:12, maxWidth:480, margin:"12px auto 0" }}>
              A fully on-chain pipeline from government deposit to citizen's wallet — no human can intercept it.
            </p>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"3rem", alignItems:"start" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:"2rem" }}>
              {HOW_IT_WORKS.map((s,i) => <HowStep key={s.step} {...s} index={i} />)}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
              {[
                { icon:<ShieldIcon />, title:"Tamper-Proof Entitlements", desc:"Amounts are locked at registration. No official can reduce your payout — not even the admin." },
                { icon:<WalletIcon />, title:"No Middlemen", desc:"Funds go from government wallet directly to yours. No barangay agents, no 'service charges'." },
                { icon:<ChartIcon />, title:"Public Audit Log", desc:"Every disbursement is on-chain. Query the contract or view the audit table below — anytime." },
              ].map((f) => (
                <div key={f.title} className="feature-card">
                  <div style={{ display:"flex", gap:"1rem", alignItems:"flex-start" }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:"rgba(124,58,237,0.12)", border:"1px solid rgba(124,58,237,0.28)", display:"flex", alignItems:"center", justifyContent:"center", color:"#a78bfa", flexShrink:0 }}>{f.icon}</div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:600, color:"#f3f4f6", marginBottom:5 }}>{f.title}</div>
                      <div style={{ fontSize:13, color:"#9ca3af", lineHeight:1.7 }}>{f.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CLAIM SECTION ── */}
      <section id="claim" style={{ padding:"5rem 2rem", background:"rgba(124,58,237,0.05)", borderTop:"1px solid rgba(124,58,237,0.14)", borderBottom:"1px solid rgba(124,58,237,0.14)" }}>
        <div style={{ maxWidth:520, margin:"0 auto", textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#7c3aed", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 }}>
            CYCLE {currentCycle !== null ? currentCycle : "—"} · NOW OPEN
          </div>
          <h2 style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"clamp(1.8rem,3vw,2.4rem)", fontWeight:700, color:"#fff", marginBottom:"1rem", letterSpacing:"-0.025em" }}>
            Claim Your Subsidy
          </h2>
          <p style={{ fontSize:15, color:"#9ca3af", marginBottom:"2.5rem", lineHeight:1.7 }}>
            Connect your Freighter wallet to check eligibility and claim your registered entitlement for this cycle.
          </p>

          {/* Already claimed banner */}
          {alreadyClaimed && !claimed && (
            <div style={{ background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.22)", borderRadius:14, padding:"1.25rem 1.5rem", marginBottom:"1.5rem", textAlign:"left" }}>
              <div style={{ fontSize:14, fontWeight:600, color:"#fde68a", marginBottom:5 }}>Already Claimed This Cycle</div>
              <div style={{ fontSize:13, color:"#9ca3af", lineHeight:1.6 }}>
                Your wallet has already claimed the subsidy for Cycle {currentCycle}. Check back when the next cycle opens.
              </div>
            </div>
          )}

          {/* Success state */}
          {claimed ? (
            <div style={{ background:"rgba(16,185,129,0.07)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:18, padding:"2rem", animation:"fadeUp 0.5s ease both" }}>
              <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.28)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 1.25rem", color:"#34d399" }}>
                <CheckIcon />
              </div>
              <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:22, fontWeight:700, color:"#34d399", marginBottom:8 }}>Subsidy Claimed!</div>
              <div style={{ fontSize:14, color:"#9ca3af", marginBottom:"1.25rem", lineHeight:1.7 }}>
                ₱{Number(beneficiaryRecord?.entitlement ?? 0).toLocaleString()} has been sent to your Stellar wallet.
              </div>
              {txHash && (
                <div style={{ background:"rgba(0,0,0,0.25)", borderRadius:10, padding:"0.75rem 1rem", fontSize:12, color:"#6b7280", fontFamily:"'DM Mono',monospace", wordBreak:"break-all", marginBottom:"1rem" }}>
                  TX: {txHash}
                </div>
              )}
              <a
                href="https://stellar.expert/explorer/testnet"
                target="_blank"
                rel="noreferrer"
                style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, color:"#a78bfa", textDecoration:"none", fontWeight:500 }}
              >
                View on Stellar Explorer <ExternalIcon />
              </a>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:"0.85rem", textAlign:"left" }}>
              {/* Wallet connected badge */}
              {walletAddress ? (
                <div style={{ background:"rgba(124,58,237,0.08)", border:"1px solid rgba(124,58,237,0.25)", borderRadius:10, padding:"0.75rem 1rem", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:13, color:"#c4b5fd", fontWeight:500 }}>Wallet Connected</div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#9ca3af" }}>{shortAddr}</div>
                </div>
              ) : (
                <button className="btn-primary" style={{ width:"100%", justifyContent:"center", padding:"0.9rem" }} onClick={handleConnectWallet} disabled={walletLoading}>
                  {walletLoading ? <SpinnerIcon /> : <WalletIcon />}
                  {walletLoading ? "Connecting to Freighter…" : "Connect Freighter Wallet"}
                </button>
              )}

              {/* Claim button — only show if wallet connected, not already claimed, and beneficiary is active */}
              {walletAddress && !alreadyClaimed && !eligibilityError && beneficiaryRecord?.active && (
                <button
                  className="btn-primary"
                  style={{ width:"100%", justifyContent:"center", padding:"0.9rem", opacity: claiming ? 0.7 : 1 }}
                  onClick={handleClaim}
                  disabled={claiming}
                >
                  {claiming
                    ? <><SpinnerIcon /> Signing on Freighter…</>
                    : <>Claim ₱{Number(beneficiaryRecord?.entitlement ?? 0).toLocaleString()} Subsidy <ArrowIcon /></>
                  }
                </button>
              )}

              {eligibilityError && (
                <div className="error-box">
                  <AlertIcon />
                  <div>
                    <div style={{ fontWeight:600, marginBottom:2 }}>Not Eligible to Claim</div>
                    <div style={{ opacity:0.85 }}>{eligibilityError}</div>
                  </div>
                </div>
              )}

              {claimError && (
                <div className="error-box">
                  <AlertIcon />
                  <div>
                    <div style={{ fontWeight:600, marginBottom:2 }}>Transaction Failed</div>
                    <div style={{ opacity:0.85 }}>{claimError}</div>
                  </div>
                </div>
              )}

              <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", fontSize:12, color:"#6b7280" }}>
                <CheckIcon /> Secured by Stellar smart contract · Zero fees
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── AUDIT LOG ── */}
      <section id="audit" style={{ padding:"5rem 2rem" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"2rem", flexWrap:"wrap", gap:"1rem" }}>
            <div>
              <div style={{ fontSize:11, color:"#7c3aed", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:8 }}>ON-CHAIN</div>
              <h2 style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"clamp(1.5rem,2.5vw,2rem)", fontWeight:700, color:"#fff", letterSpacing:"-0.02em" }}>Live Audit Log</h2>
              <p style={{ fontSize:14, color:"#9ca3af", marginTop:6 }}>Every disbursement from the smart contract. Immutable and public.</p>
            </div>
            <div style={{ display:"flex", gap:"0.75rem" }}>
              <button className="btn-outline" onClick={loadAuditLog} disabled={auditLoading}>
                {auditLoading ? <SpinnerIcon /> : null}
                {auditLoading ? "Loading…" : "Refresh"}
              </button>
              <a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer" className="btn-primary">
                Stellar Explorer <ExternalIcon />
              </a>
            </div>
          </div>

          <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, overflow:"hidden" }}>
            {auditLoading ? (
              <div style={{ padding:"3rem", textAlign:"center", color:"#6b7280", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                <SpinnerIcon /> Loading from Stellar Testnet…
              </div>
            ) : auditLog.length === 0 ? (
              <div style={{ padding:"3rem", textAlign:"center" }}>
                <div style={{ fontSize:14, color:"#6b7280", marginBottom:6 }}>No disbursements yet.</div>
                <div style={{ fontSize:13, color:"#4b5563" }}>Once the admin funds the contract and beneficiaries claim, records will appear here.</div>
              </div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Cycle</th>
                      <th>Name</th>
                      <th>Wallet</th>
                      <th>Amount</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...auditLog].map((r,i) => <AuditRow key={i} record={r} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── ADMIN PANEL ── */}
      {isAdmin && (
        <section style={{ padding:"5rem 2rem", background:"rgba(239,68,68,0.04)", borderTop:"1px solid rgba(239,68,68,0.14)" }}>
          <div style={{ maxWidth:700, margin:"0 auto" }}>
            <div style={{ marginBottom:"2.5rem" }}>
              <div style={{ fontSize:11, color:"#ef4444", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:8 }}>
                ADMIN ONLY
              </div>
              <h2 style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"1.8rem", fontWeight:700, color:"#fff", letterSpacing:"-0.025em" }}>
                Contract Administration
              </h2>
              <p style={{ fontSize:14, color:"#9ca3af", marginTop:6 }}>
                Only visible to the registered admin wallet. Use this to fund the contract and register beneficiaries for testing.
              </p>
            </div>

            {/* Fund contract */}
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:"1.75rem", marginBottom:"1.5rem" }}>
              <div style={{ fontSize:15, fontWeight:600, color:"#f3f4f6", marginBottom:"1.25rem" }}>
                Fund Contract
              </div>
              <div style={{ display:"flex", gap:"0.75rem" }}>
                <input
                  type="number"
                  placeholder="Amount (e.g. 5000)"
                  value={adminFundAmount}
                  onChange={(e) => setAdminFundAmount(e.target.value)}
                  style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"0.7rem 1rem", color:"#f3f4f6", fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:"none" }}
                />
                <button
                  className="btn-primary"
                  disabled={adminFunding || !adminFundAmount}
                  onClick={async () => {
                    setAdminFunding(true);
                    setAdminFundError(null);
                    setAdminFundSuccess(false);
                    try {
                      await fundContract(walletAddress, adminFundAmount);
                      setAdminFundSuccess(true);
                      setAdminFundAmount("");
                      await loadStats();
                    } catch (e) {
                      setAdminFundError(e.message || "Fund failed.");
                    } finally {
                      setAdminFunding(false);
                    }
                  }}
                >
                  {adminFunding ? <SpinnerIcon /> : null}
                  {adminFunding ? "Funding…" : "Fund"}
                </button>
              </div>
              {adminFundSuccess && (
                <div style={{ marginTop:"0.75rem", fontSize:13, color:"#34d399", display:"flex", gap:6, alignItems:"center" }}>
                  <CheckIcon /> Funded successfully!
                </div>
              )}
              {adminFundError && (
                <div className="error-box" style={{ marginTop:"0.75rem" }}>
                  <AlertIcon /> {adminFundError}
                </div>
              )}
            </div>

            {/* Register beneficiary */}
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:"1.75rem" }}>
              <div style={{ fontSize:15, fontWeight:600, color:"#f3f4f6", marginBottom:"1.25rem" }}>
                Register Beneficiary
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
                <input
                  type="text"
                  placeholder="Wallet address (G…)"
                  value={regAddress}
                  onChange={(e) => setRegAddress(e.target.value)}
                  style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"0.7rem 1rem", color:"#f3f4f6", fontSize:14, fontFamily:"'DM Mono',monospace", outline:"none" }}
                />
                <input
                  type="text"
                  placeholder="Full name (e.g. Juan dela Cruz)"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"0.7rem 1rem", color:"#f3f4f6", fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:"none" }}
                />
                <div style={{ display:"flex", gap:"0.75rem" }}>
                  <input
                    type="number"
                    placeholder="Entitlement amount (e.g. 1000)"
                    value={regEntitlement}
                    onChange={(e) => setRegEntitlement(e.target.value)}
                    style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"0.7rem 1rem", color:"#f3f4f6", fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:"none" }}
                  />
                  <button
                    className="btn-primary"
                    disabled={registering || !regAddress || !regName || !regEntitlement}
                    onClick={async () => {
                      setRegistering(true);
                      setRegError(null);
                      setRegSuccess(false);
                      try {
                        await registerBeneficiary(walletAddress, regAddress, regName, regEntitlement);
                        setRegSuccess(true);
                        setRegAddress("");
                        setRegName("");
                        setRegEntitlement("");
                      } catch (e) {
                        setRegError(e.message || "Registration failed.");
                      } finally {
                        setRegistering(false);
                      }
                    }}
                  >
                    {registering ? <SpinnerIcon /> : null}
                    {registering ? "Registering…" : "Register"}
                  </button>
                </div>
              </div>
              {regSuccess && (
                <div style={{ marginTop:"0.75rem", fontSize:13, color:"#34d399", display:"flex", gap:6, alignItems:"center" }}>
                  <CheckIcon /> Beneficiary registered successfully!
                </div>
              )}
              {regError && (
                <div className="error-box" style={{ marginTop:"0.75rem" }}>
                  <AlertIcon /> {regError}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
      <footer style={{ borderTop:"1px solid rgba(255,255,255,0.05)", padding:"2rem", textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:8 }}>
          <div style={{ width:24, height:24, borderRadius:7, background:"linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", color:"#e9d5ff" }}>
            <ShieldIcon />
          </div>
          <span style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:700, color:"#fff", fontSize:15 }}>
            Ayuda<span style={{ color:"#a78bfa" }}>Direct</span>
          </span>
        </div>
        <div style={{ fontSize:13, color:"#4b5563" }}>Built on Stellar · No processing fees · Every transaction on-chain</div>
        <div style={{ fontSize:12, color:"#374151", marginTop:8 }}>© 2025 AyudaDirect · Malolos, Bulacan · Hackathon Demo</div>
      </footer>
    </>
  );
}