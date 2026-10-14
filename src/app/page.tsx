'use client';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCheck,
  ShieldCheck,
  LayoutDashboard,
  FolderKanban,
  Wallet,
  Activity,
  LifeBuoy,
  Scale,
  Bell,
  Settings,
  LogOut,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Upload,
  Sparkles,
  X,
  Menu,
  RefreshCw,
  LockKeyhole,
  Users,
  CalendarDays,
  ExternalLink,
  Send,
  History,
  Briefcase,
  ArrowDownLeft,
  Loader2,
  Eye,
  Layers,
  Shield,
  ClipboardCheck,
  Target,
} from 'lucide-react';
import type {
  Bootstrap,
  User,
  Project,
  Milestone,
  Submission,
  Dispute,
  ActionPayload,
} from '@/components/types';
const money = (n = 0) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n / 100);
const date = (s?: string) =>
  s
    ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
const time = (s?: string) =>
  s
    ? new Date(s).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
const label = (s?: string) =>
  (s || 'Pending')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
const initials = (s: string) =>
  s
    .split(' ')
    .map((v) => v[0])
    .slice(0, 2)
    .join('');
const finished = (m: Milestone) => ['ACCEPTED', 'RELEASED'].includes(m.status);
const riskBad = (p: Project) => !['LOW', 'HEALTHY', 'ON_TRACK', 'NONE'].includes(p.risk || 'LOW');
async function request(path: string, body?: unknown) {
  const res = await fetch(path, {
    ...(body !== undefined
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function Badge({ value }: { value?: string }) {
  const v = value || 'PENDING';
  const tone =
    /^(RELEASED|ACCEPTED|COMPLETED|ACTIVE|PASS|ON_TRACK|LOW|HEALTHY|FUNDED|RESOLVED|RESUMED|SIMULATED_CONFIRMED)$/.test(
      v,
    )
      ? 'green'
      : /DISPUTED|HIGH|CRITICAL|FAIL|BLOCKED|RECOVERY/.test(v)
        ? 'red'
        : /PENDING|REVIEW|AWAITING|MEDIUM|RISK|REVISION|WARNING/.test(v)
          ? 'amber'
          : 'gray';
  return (
    <span className={`badge ${tone}`}>
      <span />
      {label(v)}
    </span>
  );
}
function Empty({
  title,
  children,
  icon = <FolderKanban size={26} />,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children || 'New activity will appear here when your team gets started.'}</p>
    </div>
  );
}
function Field({
  label: caption,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{caption}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Btn({
  children,
  onClick,
  kind = '',
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={`btn ${kind}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`logo ${dark ? 'logo-light' : ''}`}>
      <span className="logo-symbol">
        <ShieldCheck size={23} strokeWidth={2} />
      </span>
      <span>
        milestone<span className="brand-weight">guard</span>
        <span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [close]);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [data, setData] = useState<Bootstrap | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [demoMode, setDemoMode] = useState(false),
    [view, setView] = useState('home'),
    [tab, setTab] = useState('milestones'),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(''),
    [projectFilter, setProjectFilter] = useState('all'),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(null),
    [dialog, setDialog] = useState<{ kind: string; id?: string; projectId?: string } | null>(null);
  const refresh = useCallback(async () => {
    const b: Bootstrap = await request('/api/bootstrap');
    setData(b);
    setUser(b.user);
    setDemoMode(b.demoMode);
    return b;
  }, []);
  const navigate = useCallback((next: string) => {
    setView(next);
    setMobile(false);
    if (typeof window !== 'undefined') window.location.hash = next;
  }, []);
  useEffect(() => {
    const update = () => {
      setView(window.location.hash.slice(1) || 'home');
    };
    update();
    window.addEventListener('hashchange', update);
    request('/api/session')
      .then(async (s) => {
        setDemoMode(s.demoMode);
        if (s.user) {
          setUser(s.user);
          await refresh();
          if (!window.location.hash || window.location.hash === '#home') navigate('dashboard');
        }
      })
      .catch((e) => setToast({ message: e.message, error: true }))
      .finally(() => setLoading(false));
    return () => window.removeEventListener('hashchange', update);
  }, [navigate, refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function act(payload: ActionPayload) {
    setBusy(true);
    try {
      const result = await request('/api/actions', payload);
      if (result.requiresLogin) {
        setUser(null);
        setData(null);
        setDialog(null);
        navigate('login');
        setToast({
          message: 'Demo reset complete. Sign in to explore the restored scenarios.',
          error: false,
        });
        return result;
      }
      await refresh();
      setDialog(null);
      setToast({ message: 'Updated successfully. Your workspace is up to date.', error: false });
      return result;
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Something went wrong.', error: true });
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function login(email: string, password: string) {
    setBusy(true);
    try {
      const s = await request('/api/auth/login', { email, password });
      setUser(s.user);
      await refresh();
      navigate('dashboard');
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Unable to sign in.', error: true });
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await request('/api/auth/logout', {});
      setUser(null);
      setData(null);
      navigate('home');
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Unable to sign out.', error: true });
    }
  }
  const openProject = (id: string, nextTab = 'milestones') => {
    setTab(nextTab);
    navigate('project/' + id);
  };
  const project = data?.projects.find((p) => p.id === view.split('/')[1]);
  const notices = data?.notifications.filter((n) => !n.read).length || 0;
  const nav = [
    { key: 'dashboard', name: 'Overview', icon: LayoutDashboard },
    { key: 'projects', name: 'Projects', icon: FolderKanban },
    { key: 'payments', name: 'Payments', icon: Wallet },
    { key: 'monitoring', name: 'Progress & risk', icon: Activity },
    { key: 'recovery', name: 'Rescue center', icon: LifeBuoy },
    { key: 'disputes', name: 'Disputes', icon: Scale },
  ];
  if (loading)
    return (
      <div className="app-loading">
        <Logo />
        <Loader2 className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  return (
    <>
      {!user ? (
        view === 'login' || view === 'register' ? (
          <Auth
            register={view === 'register'}
            busy={busy}
            demoMode={demoMode}
            navigate={navigate}
            login={login}
            signup={async (payload) => {
              setBusy(true);
              try {
                await request('/api/auth/register', payload);
                await refresh();
                navigate('dashboard');
              } catch (e) {
                setToast({
                  message: e instanceof Error ? e.message : 'Unable to create account.',
                  error: true,
                });
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : (
          <Landing navigate={navigate} />
        )
      ) : (
        data && (
          <div className="app-shell">
            <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
              <button className="brand-button" onClick={() => navigate('dashboard')}>
                <Logo dark />
              </button>
              <div className="workspace-label">
                <span className="workspace-mark">{initials(user.name)}</span>
                <div>
                  <strong>{user.role === 'ADMIN' ? 'Platform workspace' : 'My workspace'}</strong>
                  <small>{label(user.role)} account</small>
                </div>
                <ChevronDown size={16} />
              </div>
              <div className="nav-caption">WORKSPACE</div>
              <nav>
                {nav.map(({ key, name, icon: Icon }) => (
                  <button
                    key={key}
                    className={`nav-item ${view === key || (key === 'projects' && view.startsWith('project/')) ? 'active' : ''}`}
                    onClick={() => navigate(key)}
                  >
                    <Icon size={18} />
                    <span>{name}</span>
                    {key === 'recovery' &&
                      data.recoveries.filter((r) => !['COMPLETED', 'RESUMED'].includes(r.status))
                        .length > 0 && (
                        <span className="nav-count">
                          {
                            data.recoveries.filter(
                              (r) => !['COMPLETED', 'RESUMED'].includes(r.status),
                            ).length
                          }
                        </span>
                      )}
                  </button>
                ))}
              </nav>
              <div className="nav-caption second">PERSONAL</div>
              <nav>
                <button
                  className={`nav-item ${view === 'notifications' ? 'active' : ''}`}
                  onClick={() => navigate('notifications')}
                >
                  <Bell size={18} />
                  <span>Notifications</span>
                  {notices > 0 && <span className="nav-count">{notices}</span>}
                </button>
                <button
                  className={`nav-item ${view === 'profile' ? 'active' : ''}`}
                  onClick={() => navigate('profile')}
                >
                  <Users size={18} />
                  <span>Accountability</span>
                </button>
                <button
                  className={`nav-item ${view === 'settings' ? 'active' : ''}`}
                  onClick={() => navigate('settings')}
                >
                  <Settings size={18} />
                  <span>Settings</span>
                </button>
                {user.role === 'ADMIN' && (
                  <button
                    className={`nav-item ${view === 'admin' ? 'active' : ''}`}
                    onClick={() => navigate('admin')}
                  >
                    <Shield size={18} />
                    <span>Admin controls</span>
                  </button>
                )}
              </nav>
              <div className="sidebar-bottom">
                <div className="protection-note">
                  <ShieldCheck size={24} />
                  <strong>Good work. Protected.</strong>
                  <p>Every agreement, deliverable and decision. All in one place.</p>
                </div>
                <button className="user-menu" onClick={() => navigate('settings')}>
                  <span className="avatar">{initials(user.name)}</span>
                  <span>
                    <strong>{user.name}</strong>
                    <small>{label(user.role)}</small>
                  </span>
                  <Settings size={16} />
                </button>
                <button className="signout" onClick={logout}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </aside>
            {mobile && (
              <button
                className="mobile-scrim"
                onClick={() => setMobile(false)}
                aria-label="Close navigation"
              />
            )}
            <div className="main-shell">
              <header className="topbar">
                <div className="topbar-crumb">
                  <button
                    className="icon-btn mobile-toggle"
                    aria-label="Open navigation"
                    onClick={() => setMobile(!mobile)}
                  >
                    <Menu size={20} />
                  </button>
                  <span>Workspace</span>
                  <ChevronRight size={14} />
                  <strong>
                    {project
                      ? project.title
                      : view === 'new'
                        ? 'New project'
                        : nav.find((n) => n.key === view)?.name || label(view)}
                  </strong>
                </div>
                <div className="topbar-actions">
                  <span className="secure-label">
                    <span /> Private workspace
                  </span>
                  <button
                    className="icon-btn notification-btn"
                    onClick={() => navigate('notifications')}
                    aria-label="Notifications"
                  >
                    <Bell size={19} />
                    {notices > 0 && <i />}
                  </button>
                  <button
                    className="avatar small"
                    onClick={() => navigate('profile')}
                    aria-label="Your profile"
                  >
                    {initials(user.name)}
                  </button>
                </div>
              </header>
              <main className="main-content">
                {data.demoMode && (
                  <div className="demo-banner">
                    <span>
                      <span className="demo-pill">DEMO WORKSPACE</span> Simulated funds —
                      demonstration mode
                    </span>
                    <span>
                      Rule-based assistance{' '}
                      <span className="hide-small">· No real money moves</span>
                    </span>
                  </div>
                )}
                {view === 'dashboard' && (
                  <Dashboard data={data} openProject={openProject} navigate={navigate} />
                )}
                {view === 'projects' && (
                  <>
                    <PageTitle
                      eyebrow="YOUR WORKSPACE"
                      title="Projects"
                      description="A clear path from the first agreement to the final handover."
                      action={
                        user.role === 'CLIENT' && (
                          <Btn onClick={() => navigate('new')}>
                            <Plus size={17} />
                            New project
                          </Btn>
                        )
                      }
                    />
                    <div className="list-toolbar">
                      <div className="segmented">
                        {['all', 'active', 'at risk', 'completed'].map((f) => (
                          <button
                            key={f}
                            className={projectFilter === f ? 'selected' : ''}
                            onClick={() => setProjectFilter(f)}
                          >
                            {label(f)}
                          </button>
                        ))}
                      </div>
                      <label className="search">
                        <Search size={17} />
                        <input
                          placeholder="Search projects…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="projects-grid">
                      {data.projects
                        .filter(
                          (p) =>
                            p.title.toLowerCase().includes(query.toLowerCase()) &&
                            (projectFilter === 'all' ||
                              (projectFilter === 'at risk'
                                ? riskBad(p)
                                : projectFilter === 'completed'
                                  ? p.status === 'COMPLETED'
                                  : p.status !== 'COMPLETED')),
                        )
                        .map((p, i) => (
                          <ProjectCard
                            key={p.id}
                            p={p}
                            data={data}
                            index={i}
                            onClick={() => openProject(p.id)}
                          />
                        ))}
                    </div>
                    {data.projects.length === 0 && (
                      <Empty title="Your next great project starts here">
                        Create a project, agree on milestones, and get moving with confidence.
                      </Empty>
                    )}
                  </>
                )}
                {view === 'new' && user.role === 'CLIENT' && (
                  <ProjectWizard
                    data={data}
                    busy={busy}
                    create={async (payload) => {
                      const result = await act({ type: 'createProject', ...payload });
                      if (result) {
                        const id = result.projectId || result.project?.id;
                        if (id) openProject(id, 'agreement');
                        else navigate('projects');
                      }
                    }}
                    back={() => navigate('projects')}
                  />
                )}
                {project && (
                  <ProjectDetail
                    data={data}
                    project={project}
                    tab={tab}
                    setTab={setTab}
                    busy={busy}
                    act={act}
                    dialog={setDialog}
                    openProject={openProject}
                  />
                )}
                {view === 'payments' && (
                  <>
                    <PageTitle
                      eyebrow="PAYMENT PROTECTION"
                      title="Every rupee, accounted for."
                      description="A complete record of funding, protected balances and confirmed settlements."
                    />
                    <FinancialCards data={data} />
                    <LedgerTable rows={data.ledger} data={data} />
                  </>
                )}
                {view === 'monitoring' && (
                  <>
                    <PageTitle
                      eyebrow="ACCOUNTABILITY"
                      title="Keep the work moving."
                      description="Explainable risk signals help your team act before small delays become bigger problems."
                    />
                    <div className="info-strip">
                      <Activity size={19} />
                      <span>
                        Risk is rule-based, using recorded activity, deadlines and check-ins. It is
                        a signal for a conversation, not proof of abandonment.
                      </span>
                    </div>
                    <div className="risk-grid">
                      {data.projects.map((p) => (
                        <Panel key={p.id} title={p.title} action={<Badge value={p.risk} />}>
                          <div className="panel-body">
                            <div className="detail-pair">
                              <span>Last meaningful activity</span>
                              <strong>{time(p.lastActivityAt)}</strong>
                            </div>
                            <div className="detail-pair">
                              <span>Project deadline</span>
                              <strong>{date(p.deadline)}</strong>
                            </div>
                            {p.riskReasons?.length ? (
                              <ul className="risk-reasons">
                                {p.riskReasons.map((r, i) => (
                                  <li key={i}>
                                    <AlertTriangle size={15} />
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="muted small-text">No elevated risk signals recorded.</p>
                            )}
                            <Btn
                              kind="secondary full"
                              onClick={() => openProject(p.id, 'progress')}
                            >
                              View progress
                              <ArrowRight size={16} />
                            </Btn>
                          </div>
                        </Panel>
                      ))}
                    </div>
                  </>
                )}
                {view === 'recovery' && (
                  <>
                    <PageTitle
                      eyebrow="PROJECT CONTINUITY"
                      title="A fresh path forward."
                      description="Preserve completed work, protect unresolved funds and help projects reach the finish line."
                    />
                    <RecoveryCenter data={data} dialog={setDialog} openProject={openProject} />
                  </>
                )}
                {view === 'disputes' && (
                  <>
                    <PageTitle
                      eyebrow="FAIR RESOLUTION"
                      title="Resolve with evidence."
                      description="Structured conversations, original agreements and a clear record of every decision."
                    />
                    <DisputeList
                      data={data}
                      disputes={data.disputes}
                      dialog={setDialog}
                      openProject={openProject}
                    />
                  </>
                )}
                {view === 'notifications' && (
                  <>
                    <PageTitle
                      eyebrow="YOUR INBOX"
                      title="Stay in the loop."
                      description="The updates that need your attention, in one place."
                      action={
                        <Btn
                          kind="secondary"
                          disabled={busy || !notices}
                          onClick={() => act({ type: 'markRead', notificationId: 'all' })}
                        >
                          <CheckCheck size={17} />
                          Mark all read
                        </Btn>
                      }
                    />
                    <Panel title="Notifications" subtitle={`${notices} unread updates`}>
                      {data.notifications.length ? (
                        data.notifications.map((n) => (
                          <div className={`notification-row ${n.read ? '' : 'unread'}`} key={n.id}>
                            <div className="notification-symbol">
                              <Bell size={18} />
                            </div>
                            <div>
                              <p>{n.message}</p>
                              <small>{time(n.createdAt)}</small>
                            </div>
                            {n.projectId && (
                              <button
                                className="text-link"
                                onClick={() => openProject(n.projectId!)}
                              >
                                View project <ArrowUpRight size={14} />
                              </button>
                            )}
                            {!n.read && (
                              <button
                                className="icon-btn"
                                aria-label="Mark read"
                                onClick={() => act({ type: 'markRead', notificationId: n.id })}
                              >
                                <Check size={17} />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <Empty title="You’re all caught up" icon={<Bell size={26} />} />
                      )}
                    </Panel>
                  </>
                )}
                {view === 'profile' && <Accountability data={data} />}
                {view === 'settings' && (
                  <>
                    <PageTitle
                      eyebrow="YOUR ACCOUNT"
                      title="Make yourself at home."
                      description="Manage your workspace profile and session."
                    />
                    <div className="settings-grid">
                      <Panel title="Profile details">
                        <form
                          className="panel-body form-stack"
                          onSubmit={(e) => {
                            e.preventDefault();
                            act({
                              type: 'updateProfile',
                              name: new FormData(e.currentTarget).get('name'),
                            });
                          }}
                        >
                          <div className="profile-heading">
                            <span className="avatar large">{initials(user.name)}</span>
                            <div>
                              <h3>{user.name}</h3>
                              <Badge value={user.role} />
                            </div>
                          </div>
                          <Field label="Full name">
                            <input
                              name="name"
                              defaultValue={user.name}
                              minLength={2}
                              maxLength={100}
                              required
                            />
                          </Field>
                          <Field
                            label="Email address"
                            hint="Your email is your account identifier."
                          >
                            <input value={user.email} disabled />
                          </Field>
                          <Btn type="submit" disabled={busy}>
                            Save changes
                          </Btn>
                        </form>
                      </Panel>
                      <Panel title="Workspace information">
                        <div className="panel-body form-stack">
                          <div className="info-strip">
                            <LockKeyhole size={22} />
                            <span>
                              Your session is authenticated with a private, server-managed cookie.
                            </span>
                          </div>
                          <div className="detail-pair">
                            <span>Account role</span>
                            <strong>{label(user.role)}</strong>
                          </div>
                          <div className="detail-pair">
                            <span>Payment environment</span>
                            <strong>Simulated payments</strong>
                          </div>
                          <div className="detail-pair">
                            <span>Scope assistance</span>
                            <strong>Rule-based suggestions</strong>
                          </div>
                          <Btn kind="secondary" onClick={logout}>
                            <LogOut size={16} />
                            Sign out of this account
                          </Btn>
                          <small className="muted">
                            To explore another demo role, sign out and select a demo account on the
                            sign-in screen.
                          </small>
                        </div>
                      </Panel>
                    </div>
                  </>
                )}
                {view === 'admin' && user.role === 'ADMIN' && (
                  <Admin data={data} act={act} busy={busy} dialog={setDialog} />
                )}
                {![
                  'dashboard',
                  'projects',
                  'new',
                  'payments',
                  'monitoring',
                  'recovery',
                  'disputes',
                  'notifications',
                  'profile',
                  'settings',
                  'admin',
                ].includes(view) &&
                  !project && (
                    <Empty title="This page is not available">
                      <button className="text-link" onClick={() => navigate('dashboard')}>
                        Return to your overview
                      </button>
                    </Empty>
                  )}
                <footer className="workspace-footer">
                  <span>
                    <ShieldCheck size={14} /> MilestoneGuard · Built for work that gets finished.
                  </span>
                  <span>All amounts in INR</span>
                </footer>
              </main>
            </div>
          </div>
        )
      )}
      {dialog && data && (
        <ActionDialog
          dialog={dialog}
          data={data}
          close={() => setDialog(null)}
          busy={busy}
          act={act}
          refresh={refresh}
          notify={(message, error = false) => setToast({ message, error })}
        />
      )}
      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role="status">
          {toast.error ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss">
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Landing({ navigate }: { navigate: (v: string) => void }) {
  return (
    <div className="landing">
      <header className="landing-header">
        <Logo />
        <nav>
          <a href="#how-it-works">How it works</a>
          <a href="#protection">Your protection</a>
          <button onClick={() => navigate('login')}>Sign in</button>
          <Btn onClick={() => navigate('register')}>
            Get started
            <ArrowUpRight size={16} />
          </Btn>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-dot" /> SMALL TEAMS. BIG AMBITIONS.
            </div>
            <h1>
              Great work deserves
              <br />
              <em>a strong finish.</em>
            </h1>
            <p>
              Turn freelance projects into shared commitments. Clear milestones, verified
              deliverables, and protected payments — all the way to done.
            </p>
            <div className="hero-actions">
              <Btn onClick={() => navigate('register')}>
                Start a project
                <ArrowRight size={18} />
              </Btn>
              <Btn kind="secondary" onClick={() => navigate('login')}>
                Explore the demo
                <ArrowUpRight size={17} />
              </Btn>
            </div>
            <div className="hero-note">
              <ShieldCheck size={16} /> Agree with clarity. Work with confidence.
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-grid" />
            <div className="floating-tag">
              <span className="icon-tile mint">
                <ShieldCheck size={23} />
              </span>
              <span>
                <strong>Protection at every step</strong>
                <small>From the first idea to the final file.</small>
              </span>
            </div>
            <div className="hero-project">
              <div className="hero-project-top">
                <span className="icon-tile peach">
                  <Layers size={22} />
                </span>
                <Badge value="IN_PROGRESS" />
              </div>
              <h3>College festival website</h3>
              <p>A shared plan. A clear way forward.</p>
              <div className="hero-progress">
                <span style={{ width: '66%' }} />
              </div>
              {[
                { title: 'Design & direction', sub: 'Deliverables accepted', done: true },
                { title: 'Build & bring to life', sub: 'Ready for your review', done: false },
                { title: 'Launch & handover', sub: 'Payment protected', done: false },
              ].map((m, i) => (
                <div className="hero-milestone" key={m.title}>
                  <span className={m.done ? 'step-circle done' : 'step-circle'}>
                    {m.done ? <Check size={15} /> : i + 1}
                  </span>
                  <div>
                    <strong>{m.title}</strong>
                    <small>{m.sub}</small>
                  </div>
                  {i === 2 ? (
                    <LockKeyhole size={16} />
                  ) : i === 0 ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Clock size={16} />
                  )}
                </div>
              ))}
              <div className="hero-project-foot">
                <span>
                  <LockKeyhole size={14} /> Simulated protected funds
                </span>
                <strong>₹12,000</strong>
              </div>
            </div>
            <div className="floating-done">
              <span className="circle-check">
                <Check size={17} />
              </span>
              <div>
                <strong>Another milestone. One step closer.</strong>
                <small>Review the work. Release with confidence.</small>
              </div>
            </div>
          </div>
        </section>
        <div className="manifesto">
          <span>LESS UNCERTAINTY.</span>
          <strong>More getting it done.</strong>
          <p>Built for freelancers, student teams and small businesses.</p>
        </div>
        <section className="landing-features" id="how-it-works">
          <div className="eyebrow">A BETTER WAY TO WORK TOGETHER</div>
          <h2>Keep everyone on the same page.</h2>
          <div className="feature-grid">
            {[
              {
                icon: ClipboardCheck,
                title: 'Start with a shared yes.',
                text: 'Turn your idea into measurable milestones. Both sides approve the same scope before work begins.',
              },
              {
                icon: ShieldCheck,
                title: 'Let good work move you forward.',
                text: 'Submit, verify and review deliverables in one place. Simulated payouts follow an authorized acceptance.',
              },
              {
                icon: LifeBuoy,
                title: 'Keep a plan B in your pocket.',
                text: 'Spot delays early. Preserve the work and create a structured handover when a project needs a fresh start.',
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <article key={title}>
                <span className="feature-number">0{i + 1}</span>
                <Icon size={28} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-cta" id="protection">
          <div>
            <div className="eyebrow">VERIFY THE WORK. PROTECT THE PAYMENT.</div>
            <h2>
              Bring your next project
              <br />
              across the finish line.
            </h2>
            <p>A functional local demo. Simulated funds. Real accountability workflows.</p>
          </div>
          <Btn onClick={() => navigate('login')}>
            Take a look inside
            <ArrowUpRight size={18} />
          </Btn>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <p>Made for the work that matters.</p>
        <span>Demo environment · No real payments</span>
      </footer>
    </div>
  );
}
function Auth({
  register,
  busy,
  demoMode,
  navigate,
  login,
  signup,
}: {
  register: boolean;
  busy: boolean;
  demoMode: boolean;
  navigate: (v: string) => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (p: Record<string, string>) => Promise<void>;
}) {
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <button className="brand-button" onClick={() => navigate('home')}>
          <Logo dark />
        </button>
        <div>
          <div className="eyebrow">MOVE FORWARD, TOGETHER.</div>
          <h1>
            Clear expectations.
            <br />
            Confident decisions.
            <br />
            <em>Better outcomes.</em>
          </h1>
          <p>
            A little clarity goes a long way. Give every project a shared plan, a protected payment
            and a path to completion.
          </p>
          <div className="auth-principles">
            <span>
              <CheckCircle2 />
              Mutually signed agreements
            </span>
            <span>
              <CheckCircle2 />
              Evidence-backed milestones
            </span>
            <span>
              <CheckCircle2 />A recovery plan, built in
            </span>
          </div>
        </div>
        <small>MilestoneGuard · Verify. Protect. Finish.</small>
      </section>
      <section className="auth-main">
        <button className="back-link" onClick={() => navigate('home')}>
          <ArrowLeft size={16} />
          Back to home
        </button>
        <div className="auth-form">
          <div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div>
          <h1>{register ? 'Let’s get to good work.' : 'Welcome back.'}</h1>
          <p>
            {register
              ? 'Create your account and build something together.'
              : 'Your projects, progress and people are right here.'}
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              if (register) signup(Object.fromEntries(fd) as Record<string, string>);
              else login(String(fd.get('email')), String(fd.get('password')));
            }}
          >
            {register && (
              <>
                <Field label="Full name">
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Your full name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </Field>
                <Field label="I’m here as a">
                  <select name="role">
                    <option value="CLIENT">Client — I’m hiring for a project</option>
                    <option value="FREELANCER">Freelancer — I deliver the work</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="Email address">
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </Field>
            <Field label="Password" hint={register ? 'Use at least 10 characters.' : undefined}>
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 10 : 1}
                placeholder="Enter your password"
                required
              />
            </Field>
            <Btn type="submit" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : register ? (
                'Create account'
              ) : (
                'Sign in'
              )}
              <ArrowRight size={17} />
            </Btn>
          </form>
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to MilestoneGuard?'}{' '}
            <button onClick={() => navigate(register ? 'login' : 'register')}>
              {register ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          {demoMode && !register && (
            <div className="demo-login">
              <div>
                <span className="demo-pill">LIVE DEMO</span>
                <p>Take a seat. Explore a real workflow.</p>
              </div>
              <div className="demo-roles">
                {[
                  { key: 'client', name: 'Client', icon: Briefcase },
                  { key: 'freelancer', name: 'Freelancer', icon: Users },
                  { key: 'replacement', name: 'Replacement', icon: LifeBuoy },
                  { key: 'admin', name: 'Administrator', icon: Shield },
                ].map(({ key, name, icon: Icon }) => (
                  <button
                    disabled={busy}
                    key={key}
                    onClick={() => login(`${key}@milestoneguard.demo`, 'DemoPass123!')}
                  >
                    <Icon size={17} />
                    {name}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
              <small>Seeded accounts · Persistent demo data · Simulated funds</small>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
function Dashboard({
  data,
  openProject,
  navigate,
}: {
  data: Bootstrap;
  openProject: (id: string, tab?: string) => void;
  navigate: (v: string) => void;
}) {
  const active = data.projects.filter((p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED'),
    pending = data.milestones.filter((m) => ['SUBMITTED', 'IN_REVIEW'].includes(m.status)),
    protectedFunds = data.milestones.reduce((s, m) => s + m.funded - m.paid - m.refunded, 0),
    completed = data.milestones.filter(finished),
    risky = data.projects.filter(riskBad);
  const greeting =
    data.user.role === 'FREELANCER'
      ? 'Let’s make progress.'
      : data.user.role === 'ADMIN'
        ? 'A clear view of the big picture.'
        : 'Good work starts with clarity.';
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORK, IN PERSPECTIVE"
        title={`${data.user.name.split(' ')[0]}, ${greeting.charAt(0).toLowerCase() + greeting.slice(1)}`}
        description="Here’s where your projects stand. Let’s keep them moving forward."
        action={
          data.user.role === 'CLIENT' ? (
            <Btn onClick={() => navigate('new')}>
              <Plus size={17} />
              New project
            </Btn>
          ) : (
            <Btn kind="secondary" onClick={() => navigate('projects')}>
              View all projects
              <ArrowUpRight size={16} />
            </Btn>
          )
        }
      />
      <div className="stats-grid">
        <Stat
          title="Active projects"
          value={String(active.length)}
          note={`${data.projects.length} projects in your workspace`}
          icon={<FolderKanban size={19} />}
          color="purple"
        />
        <Stat
          title="Protected balance"
          value={money(protectedFunds)}
          note="Simulated funds, held for milestones"
          icon={<ShieldCheck size={19} />}
          color="mint"
        />
        <Stat
          title="Awaiting review"
          value={String(pending.length)}
          note={pending.length ? 'Ready for a closer look' : 'You’re all caught up'}
          icon={<ClipboardCheck size={19} />}
          color="peach"
        />
        <Stat
          title="Milestones completed"
          value={String(completed.length)}
          note={`${data.milestones.length} milestones across your projects`}
          icon={<CheckCircle2 size={19} />}
          color="blue"
        />
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <Panel
            title="Your projects"
            subtitle="Small steps. Meaningful progress."
            action={
              <button className="text-link" onClick={() => navigate('projects')}>
                View all
                <ArrowUpRight size={15} />
              </button>
            }
          >
            {data.projects.length ? (
              <div className="dashboard-projects">
                {data.projects.slice(0, 4).map((p, i) => (
                  <ProjectRow
                    key={p.id}
                    p={p}
                    data={data}
                    index={i}
                    onClick={() => openProject(p.id)}
                  />
                ))}
              </div>
            ) : (
              <Empty title="A fresh start awaits">
                Create a project and invite your freelancer to agree on the plan.
              </Empty>
            )}
          </Panel>
          <Panel
            title="Recent activity"
            subtitle="A shared record of the work getting done."
            action={<span className="subtle-pill">Live workspace</span>}
          >
            <ActivityList data={data} limit={5} />
          </Panel>
        </div>
        <div className="dashboard-aside">
          <div className="attention-card">
            <div className="attention-top">
              <span className="icon-tile peach">
                <Target size={21} />
              </span>
              <span className="subtle-pill">NEXT UP</span>
            </div>
            <h2>
              A little attention.
              <br />A lot of momentum.
            </h2>
            <p>
              {pending.length
                ? `${pending.length} submitted ${pending.length === 1 ? 'milestone is' : 'milestones are'} ready for a decision. A timely review keeps everyone moving.`
                : risky.length
                  ? `${risky.length} ${risky.length === 1 ? 'project needs' : 'projects need'} a check-in. Open the conversation and plan the next step.`
                  : 'Your workspace is ready. Check your milestones and keep the conversation going.'}
            </p>
            <button
              className="attention-link"
              onClick={() =>
                pending.length
                  ? openProject(pending[0].projectId, 'milestones')
                  : navigate(risky.length ? 'monitoring' : 'projects')
              }
            >
              {pending.length
                ? 'Review deliverables'
                : risky.length
                  ? 'Check project health'
                  : 'Explore your projects'}
              <ArrowRight size={17} />
            </button>
          </div>
          <Panel title="Project health" action={<Activity size={18} />}>
            <div className="health-summary">
              <div
                className="health-ring"
                style={
                  {
                    '--progress': `${data.projects.length ? Math.round(((data.projects.length - risky.length) / data.projects.length) * 100) : 100}%`,
                  } as React.CSSProperties
                }
              >
                <span>
                  <strong>{data.projects.length - risky.length}</strong>
                  <small>on track</small>
                </span>
              </div>
              <div className="health-legend">
                <div>
                  <span className="legend-dot mint-dot" />
                  On track<strong>{data.projects.length - risky.length}</strong>
                </div>
                <div>
                  <span className="legend-dot amber-dot" />
                  Needs attention<strong>{risky.length}</strong>
                </div>
                <div>
                  <span className="legend-dot gray-dot" />
                  Total projects<strong>{data.projects.length}</strong>
                </div>
              </div>
            </div>
            <button className="panel-bottom-link" onClick={() => navigate('monitoring')}>
              Explore risk signals
              <ArrowUpRight size={16} />
            </button>
          </Panel>
          <div className="quiet-callout">
            <LockKeyhole size={21} />
            <div>
              <h3>Confidence is built in.</h3>
              <p>
                Funds move after acceptance or an authorized resolution. Every decision leaves a
                record.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
function Stat({
  title,
  value,
  note,
  icon,
  color,
}: {
  title: string;
  value: string;
  note: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <p>{note}</p>
    </div>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <div className="progress-track">
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
function ProjectRow({
  p,
  data,
  index,
  onClick,
}: {
  p: Project;
  data: Bootstrap;
  index: number;
  onClick: () => void;
}) {
  const ms = data.milestones.filter((m) => m.projectId === p.id),
    done = ms.filter(finished).length;
  return (
    <button className="project-row" onClick={onClick}>
      <div className={`project-symbol color-${index % 4}`}>
        <span>
          {p.title
            .split(' ')
            .map((s) => s[0])
            .slice(0, 2)
            .join('')}
        </span>
      </div>
      <div className="project-row-main">
        <div>
          <h3>{p.title}</h3>
          <Badge value={p.status} />
        </div>
        <p>
          {label(p.category)}
          <span>·</span>
          {data.users.find((u) => u.id === p.freelancerId)?.name || 'Freelancer'}
        </p>
      </div>
      <div className="project-row-progress">
        <div>
          <span>
            {done}/{ms.length} milestones
          </span>
          <strong>{ms.length ? Math.round((done / ms.length) * 100) : 0}%</strong>
        </div>
        <Progress value={ms.length ? (done / ms.length) * 100 : 0} />
      </div>
      <ArrowUpRight className="project-arrow" size={18} />
    </button>
  );
}
function ProjectCard({
  p,
  data,
  index,
  onClick,
}: {
  p: Project;
  data: Bootstrap;
  index: number;
  onClick: () => void;
}) {
  const ms = data.milestones.filter((m) => m.projectId === p.id),
    done = ms.filter(finished).length;
  return (
    <button className="project-card" onClick={onClick}>
      <div className="project-card-top">
        <div className={`project-symbol color-${index % 4}`}>
          {p.title
            .split(' ')
            .map((s) => s[0])
            .slice(0, 2)
            .join('')}
        </div>
        <Badge value={p.status} />
      </div>
      <h2>{p.title}</h2>
      <p>{p.description}</p>
      <div className="card-progress-label">
        <span>
          {done} of {ms.length} milestones complete
        </span>
        <strong>{ms.length ? Math.round((done / ms.length) * 100) : 0}%</strong>
      </div>
      <Progress value={ms.length ? (done / ms.length) * 100 : 0} />
      <div className="project-card-foot">
        <span>
          <CalendarDays size={14} />
          {date(p.deadline)}
        </span>
        <strong>{money(p.budget)}</strong>
      </div>
      <div className="project-card-person">
        <span className="avatar tiny">
          {initials(data.users.find((u) => u.id === p.freelancerId)?.name || 'F')}
        </span>
        <span>{data.users.find((u) => u.id === p.freelancerId)?.name || 'Freelancer'}</span>
        <ArrowUpRight size={16} />
      </div>
    </button>
  );
}
function ActivityList({
  data,
  projectId,
  limit = 30,
}: {
  data: Bootstrap;
  projectId?: string;
  limit?: number;
}) {
  const rows = data.audit
    .filter((a) => !projectId || a.projectId === projectId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
  return rows.length ? (
    <div className="activity-list">
      {rows.map((a) => (
        <div className="activity-row" key={a.id}>
          <span className="activity-dot">
            <History size={14} />
          </span>
          <div>
            <p>
              <strong>{label(a.action)}</strong>
            </p>
            <small>
              {data.users.find((u) => u.id === a.actorId)?.name || 'System'}
              {a.projectId && <> · {data.projects.find((p) => p.id === a.projectId)?.title}</>}
            </small>
            {a.detail != null && (
              <details>
                <summary>View recorded details</summary>
                <pre>
                  {typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail, null, 2)}
                </pre>
              </details>
            )}
          </div>
          <time>{time(a.createdAt)}</time>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="The story starts here" icon={<History size={26} />} />
  );
}
function FinancialCards({ data, projectId }: { data: Bootstrap; projectId?: string }) {
  const ms = data.milestones.filter((m) => !projectId || m.projectId === projectId);
  return (
    <div className="stats-grid three">
      <Stat
        title="Protected balance"
        value={money(ms.reduce((s, m) => s + m.funded - m.paid - m.refunded, 0))}
        note="Simulated funds awaiting authorized release"
        icon={<LockKeyhole size={19} />}
        color="mint"
      />
      <Stat
        title="Confirmed releases"
        value={money(ms.reduce((s, m) => s + m.paid, 0))}
        note="Confirmed by the simulated payment adapter"
        icon={<ArrowUpRight size={19} />}
        color="blue"
      />
      <Stat
        title="Confirmed refunds"
        value={money(ms.reduce((s, m) => s + m.refunded, 0))}
        note="Returned through a recorded settlement"
        icon={<ArrowDownLeft size={19} />}
        color="peach"
      />
    </div>
  );
}
function LedgerTable({ rows, data }: { rows: Bootstrap['ledger']; data: Bootstrap }) {
  return (
    <Panel title="Transaction ledger" subtitle="SIMULATED FUNDS — DEMONSTRATION MODE">
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Project / milestone</th>
                <th>Date</th>
                <th>Status</th>
                <th className="align-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{label(l.type)}</strong>
                    <small className="mono">{l.reference || l.id}</small>
                  </td>
                  <td>
                    {data.projects.find((p) => p.id === l.projectId)?.title}
                    <small>{data.milestones.find((m) => m.id === l.milestoneId)?.title}</small>
                  </td>
                  <td>{time(l.createdAt)}</td>
                  <td>
                    <Badge value={l.status} />
                  </td>
                  <td className="align-right">
                    <strong>{money(l.amount)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No transactions yet" icon={<Wallet size={26} />}>
          Funding, releases and refunds appear here after confirmation.
        </Empty>
      )}
    </Panel>
  );
}
function ProjectDetail({
  data,
  project,
  tab,
  setTab,
  busy,
  act,
  dialog,
  openProject,
}: {
  data: Bootstrap;
  project: Project;
  tab: string;
  setTab: (v: string) => void;
  busy: boolean;
  act: (p: ActionPayload) => Promise<unknown>;
  dialog: (v: { kind: string; id?: string; projectId?: string }) => void;
  openProject: (id: string, tab?: string) => void;
}) {
  const p = project,
    ms = data.milestones.filter((m) => m.projectId === p.id),
    agreements = data.agreements
      .filter((a) => a.projectId === p.id)
      .sort((a, b) => b.version - a.version),
    done = ms.filter(finished).length;
  const client = data.user.role === 'CLIENT',
    freelancer = data.user.role === 'FREELANCER';
  return (
    <>
      <div className="project-heading">
        <button
          className="back-link"
          onClick={() => {
            window.location.hash = 'projects';
          }}
        >
          <ArrowLeft size={15} />
          All projects
        </button>
        <div className="page-title">
          <div>
            <div className="eyebrow">{label(p.category)}</div>
            <h1>{p.title}</h1>
            <p>{p.description}</p>
          </div>
          <Badge value={p.status} />
        </div>
        <div className="project-meta">
          <span>
            <Users size={15} />
            {data.users.find((u) => u.id === p.freelancerId)?.name || 'Assigned freelancer'}
          </span>
          <span>
            <CalendarDays size={15} />
            {date(p.startDate)} — {date(p.deadline)}
          </span>
          <span>
            <Wallet size={15} />
            {money(p.budget)}
          </span>
          <Badge value={p.risk} />
        </div>
      </div>
      <div className="tabs" role="tablist">
        {[
          'milestones',
          'agreement',
          'submissions',
          'payments',
          'progress',
          'recovery',
          'disputes',
          'activity',
        ].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            className={tab === t ? 'selected' : ''}
            onClick={() => setTab(t)}
          >
            {label(t)}
            {t === 'milestones' && <span>{ms.length}</span>}
          </button>
        ))}
      </div>
      {tab === 'milestones' && (
        <>
          <div className="milestone-overview">
            <div>
              <h2>A shared plan. One milestone at a time.</h2>
              <p>
                {done} of {ms.length} milestones complete
              </p>
            </div>
            <div>
              <Progress value={ms.length ? (done / ms.length) * 100 : 0} />
              <strong>{ms.length ? Math.round((done / ms.length) * 100) : 0}%</strong>
            </div>
          </div>
          <div className="milestone-list">
            {ms.map((m, i) => (
              <MilestoneCard
                key={m.id}
                milestone={m}
                index={i}
                data={data}
                busy={busy}
                act={act}
                dialog={dialog}
              />
            ))}
          </div>
        </>
      )}
      {tab === 'agreement' && (
        <>
          <Panel
            title="Project scope"
            action={
              (client || freelancer) && (
                <Btn kind="secondary" onClick={() => dialog({ kind: 'amend', projectId: p.id })}>
                  Propose amendment
                </Btn>
              )
            }
          >
            <div className="panel-body scope-grid">
              <div>
                <h4>Included in the work</h4>
                <p className="preserve-space">{p.scope}</p>
                <h4>Exclusions</h4>
                <p>{p.exclusions || 'No exclusions specified.'}</p>
              </div>
              <div>
                <h4>Revision policy</h4>
                <p>{p.revisionPolicy}</p>
                <h4>Acceptance policy</h4>
                <p>{p.acceptancePolicy}</p>
                <h4>Dispute policy</h4>
                <p>{p.disputePolicy}</p>
              </div>
            </div>
          </Panel>
          <div className="stack-top">
            {agreements.map((a, i) => (
              <Panel
                key={a.id}
                title={`Agreement version ${a.version}`}
                subtitle={`Created ${time(a.createdAt)}${i === 0 ? ' · Latest version' : ''}`}
                action={<Badge value={a.status} />}
              >
                <div className="panel-body">
                  <div className="signature-grid">
                    <div className={`signature ${a.clientAcceptedAt ? 'signed' : ''}`}>
                      <ShieldCheck size={22} />
                      <div>
                        <strong>Client acceptance</strong>
                        <p>
                          {a.clientAcceptedAt ? time(a.clientAcceptedAt) : 'Awaiting signature'}
                        </p>
                      </div>
                      {a.clientAcceptedAt && <CheckCircle2 size={20} />}
                    </div>
                    <div className={`signature ${a.freelancerAcceptedAt ? 'signed' : ''}`}>
                      <ShieldCheck size={22} />
                      <div>
                        <strong>Freelancer acceptance</strong>
                        <p>
                          {a.freelancerAcceptedAt
                            ? time(a.freelancerAcceptedAt)
                            : 'Awaiting signature'}
                        </p>
                      </div>
                      {a.freelancerAcceptedAt && <CheckCircle2 size={20} />}
                    </div>
                  </div>
                  <div className="hash-line">
                    <LockKeyhole size={14} />
                    <span>
                      Content SHA-256: <code>{a.hash}</code>
                    </span>
                  </div>
                  <details className="snapshot">
                    <summary>Inspect the immutable agreement snapshot</summary>
                    <pre>{JSON.stringify(a.snapshot, null, 2)}</pre>
                  </details>
                  {i === 0 &&
                    a.status !== 'REJECTED' &&
                    ((client && !a.clientAcceptedAt) ||
                      (freelancer && !a.freelancerAcceptedAt)) && (
                      <div className="agreement-accept">
                        <p>
                          By accepting, you confirm the scope, milestones, acceptance checklist and
                          policies in this version. Amendments require both parties to agree again.
                        </p>
                        <div className="button-row">
                          <Btn
                            disabled={busy}
                            onClick={() =>
                              act({ type: 'acceptAgreement', projectId: p.id, agreementId: a.id })
                            }
                          >
                            <Check size={17} />
                            Accept agreement
                          </Btn>
                          {freelancer && (
                            <Btn
                              kind="secondary"
                              onClick={() =>
                                dialog({ kind: 'rejectAgreement', id: a.id, projectId: p.id })
                              }
                            >
                              Decline with a reason
                            </Btn>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}
      {tab === 'submissions' && (
        <Panel
          title="Deliverable vault"
          subtitle="Versioned evidence, private attachments and transparent verification."
        >
          {data.submissions.filter((s) => s.projectId === p.id).length ? (
            data.submissions
              .filter((s) => s.projectId === p.id)
              .map((s) => (
                <SubmissionCard
                  key={s.id}
                  submission={s}
                  milestone={ms.find((m) => m.id === s.milestoneId)}
                />
              ))
          ) : (
            <Empty title="The first deliverable is still ahead" icon={<Upload size={26} />}>
              Start a funded milestone to submit work and run verification.
            </Empty>
          )}
        </Panel>
      )}
      {tab === 'payments' && (
        <>
          <FinancialCards data={data} projectId={p.id} />
          <LedgerTable rows={data.ledger.filter((l) => l.projectId === p.id)} data={data} />
        </>
      )}
      {tab === 'progress' && (
        <div className="detail-columns">
          <Panel title="Project health" action={<Badge value={p.risk} />}>
            <div className="panel-body">
              <div className="info-strip">
                <Activity size={18} />
                <span>Explainable, rule-based signals. Review the context with your teammate.</span>
              </div>
              <div className="detail-pair">
                <span>Last meaningful activity</span>
                <strong>{time(p.lastActivityAt)}</strong>
              </div>
              {p.riskReasons?.map((r, i) => (
                <p className="risk-line" key={i}>
                  <AlertTriangle size={15} />
                  {r}
                </p>
              ))}
              <div className="button-row wrap">
                {freelancer && (
                  <Btn onClick={() => dialog({ kind: 'checkin', projectId: p.id })}>
                    <Send size={16} />
                    Post a check-in
                  </Btn>
                )}
                {(client || data.user.role === 'ADMIN') && (
                  <Btn
                    kind="secondary"
                    onClick={() => dialog({ kind: 'intervene', projectId: p.id })}
                  >
                    Record intervention
                  </Btn>
                )}
                {freelancer && (
                  <Btn
                    kind="secondary"
                    onClick={() => dialog({ kind: 'withdraw', projectId: p.id })}
                  >
                    Request withdrawal
                  </Btn>
                )}
              </div>
            </div>
          </Panel>
          <Panel title="Progress check-ins" subtitle="Keep the conversation open.">
            {data.checkins.filter((c) => c.projectId === p.id).length ? (
              data.checkins
                .filter((c) => c.projectId === p.id)
                .map((c) => (
                  <div className="checkin-row" key={c.id}>
                    <div>
                      <Badge value={c.status} />
                      <time>{time(c.createdAt)}</time>
                    </div>
                    <p>{c.comment}</p>
                    <small>{data.users.find((u) => u.id === c.freelancerId)?.name}</small>
                  </div>
                ))
            ) : (
              <Empty title="No check-ins yet" icon={<Activity size={26} />}>
                A short progress update helps everyone plan.
              </Empty>
            )}
          </Panel>
        </div>
      )}
      {tab === 'recovery' && (
        <RecoveryCenter data={data} projectId={p.id} dialog={dialog} openProject={openProject} />
      )}
      {tab === 'disputes' && (
        <DisputeList
          data={data}
          disputes={data.disputes.filter((d) => d.projectId === p.id)}
          dialog={dialog}
          openProject={openProject}
        />
      )}
      {tab === 'activity' && (
        <Panel
          title="Project timeline"
          subtitle="A durable history of agreements, work and decisions."
        >
          <ActivityList data={data} projectId={p.id} />
        </Panel>
      )}
    </>
  );
}
function MilestoneCard({
  milestone: m,
  index,
  data,
  busy,
  act,
  dialog,
}: {
  milestone: Milestone;
  index: number;
  data: Bootstrap;
  busy: boolean;
  act: (p: ActionPayload) => Promise<unknown>;
  dialog: (v: { kind: string; id?: string; projectId?: string }) => void;
}) {
  const client = data.user.role === 'CLIENT',
    freelancer = data.user.role === 'FREELANCER' && m.assignedFreelancerId === data.user.id,
    submissions = data.submissions.filter((s) => s.milestoneId === m.id),
    latest = [...submissions].sort((a, b) => b.version - a.version)[0];
  return (
    <article className="milestone-card">
      <div className="milestone-card-head">
        <span className={`milestone-number ${finished(m) ? 'complete' : ''}`}>
          {finished(m) ? <Check size={19} /> : String(index + 1).padStart(2, '0')}
        </span>
        <div>
          <h3>{m.title}</h3>
          <p>{m.description}</p>
        </div>
        <div className="milestone-amount">
          <strong>{money(m.budget)}</strong>
          <Badge value={m.status} />
        </div>
      </div>
      <div className="milestone-card-body">
        <div className="milestone-main">
          <h4>Acceptance checklist</h4>
          <ul className="criteria-list">
            {m.criteria.map((c, i) => (
              <li key={i}>
                <span>{finished(m) ? <Check size={12} /> : null}</span>
                {c}
              </li>
            ))}
          </ul>
          {m.requirements && (
            <div className="deliverable-requirement">
              <FileText size={15} />
              <span>{m.requirements}</span>
            </div>
          )}
          <details className="small-details">
            <summary>File requirements and review terms</summary>
            <p>
              Allowed: {m.allowedTypes.join(', ')} · Maximum{' '}
              {Math.round(m.maxFileSize / 1024 / 1024)} MB · {m.revisionLimit} revisions ·{' '}
              {m.reviewHours}-hour review window
            </p>
            <p>Revisions used: {m.revisionCount}</p>
          </details>
        </div>
        <div className="milestone-side">
          <div className="detail-pair">
            <span>Due date</span>
            <strong>{date(m.dueDate)}</strong>
          </div>
          <div className="detail-pair">
            <span>Payment</span>
            <Badge value={m.paymentStatus} />
          </div>
          <div className="detail-pair">
            <span>Protected</span>
            <strong>{money(m.funded - m.paid - m.refunded)}</strong>
          </div>
          {m.submittedAt && (
            <div className="detail-pair">
              <span>Submitted</span>
              <strong>{date(m.submittedAt)}</strong>
            </div>
          )}
          <div className="milestone-actions">
            {client && m.status === 'AWAITING_FUNDING' && (
              <Btn disabled={busy} onClick={() => act({ type: 'fund', milestoneId: m.id })}>
                <LockKeyhole size={15} />
                Fund milestone
              </Btn>
            )}
            {freelancer && m.status === 'READY_TO_START' && (
              <Btn disabled={busy} onClick={() => act({ type: 'start', milestoneId: m.id })}>
                Start milestone
                <ArrowRight size={15} />
              </Btn>
            )}
            {freelancer && ['IN_PROGRESS', 'REVISION_REQUESTED'].includes(m.status) && (
              <Btn onClick={() => dialog({ kind: 'upload', id: m.id })}>
                <Upload size={15} />
                Submit deliverable
              </Btn>
            )}
            {client && ['SUBMITTED', 'IN_REVIEW'].includes(m.status) && (
              <>
                <Btn onClick={() => dialog({ kind: 'review', id: m.id })}>
                  <Eye size={15} />
                  Review deliverable
                </Btn>
              </>
            )}
            {client && m.status === 'ACCEPTED' && m.funded > m.paid + m.refunded && (
              <Btn disabled={busy} onClick={() => act({ type: 'payout', milestoneId: m.id })}>
                Release simulated payment
                <ArrowUpRight size={15} />
              </Btn>
            )}
            {(client || freelancer) &&
              ![
                'DRAFT',
                'AWAITING_AGREEMENT',
                'AWAITING_FUNDING',
                'RELEASED',
                'CANCELLED',
                'REFUNDED',
                'DISPUTED',
              ].includes(m.status) && (
                <button
                  className="muted-link"
                  onClick={() => dialog({ kind: 'dispute', id: m.id })}
                >
                  Raise a dispute
                </button>
              )}
          </div>
        </div>
      </div>
      {latest && (
        <details className="submission-inline">
          <summary>
            <FileText size={16} />
            <span>
              Latest submission · v{latest.version} · {latest.fileName}
            </span>
            <ChevronDown size={15} />
          </summary>
          <SubmissionCard submission={latest} milestone={m} />
        </details>
      )}
    </article>
  );
}
function SubmissionCard({
  submission: s,
  milestone,
}: {
  submission: Submission;
  milestone?: Milestone;
}) {
  const safeUrl = s.url && /^https?:\/\//i.test(s.url) ? s.url : null;
  return (
    <div className="submission-card">
      <div className="submission-head">
        <span className="icon-tile blue">
          <FileText size={22} />
        </span>
        <div>
          <h3>{s.fileName}</h3>
          <p>
            {milestone?.title} · Version {s.version} · {(s.size / 1024).toFixed(1)} KB ·{' '}
            {time(s.createdAt)}
          </p>
        </div>
        <a className="btn secondary" href={`/api/files/${encodeURIComponent(s.id)}`} download>
          <Download size={16} />
          Download
        </a>
      </div>
      <p className="preserve-space">{s.description}</p>
      {safeUrl && (
        <a className="text-link" href={safeUrl} target="_blank" rel="noopener noreferrer">
          View linked evidence
          <ExternalLink size={14} />
        </a>
      )}
      <div className="verification-label">
        <Sparkles size={15} />
        {s.verification?.source || 'Rule-based verification'} · Human acceptance required
      </div>
      <div className="verification-grid">
        {s.verification?.checks?.map((c, i) => (
          <div key={'check' + i}>
            <Badge value={c.result} />
            <strong>{c.name}</strong>
            <p>{c.explanation}</p>
          </div>
        ))}
        {s.verification?.criteria?.map((c, i) => (
          <div key={'criterion' + i}>
            <Badge value={c.result} />
            <strong>{c.criterion}</strong>
            <p>{c.explanation}</p>
          </div>
        ))}
      </div>
      <div className="hash-line">
        <LockKeyhole size={13} />
        <code>SHA-256: {s.hash}</code>
      </div>
    </div>
  );
}
function RecoveryCenter({
  data,
  projectId,
  dialog,
  openProject,
}: {
  data: Bootstrap;
  projectId?: string;
  dialog: (v: { kind: string; id?: string; projectId?: string }) => void;
  openProject: (id: string, tab?: string) => void;
}) {
  const recoveries = data.recoveries.filter((r) => !projectId || r.projectId === projectId);
  return (
    <>
      <div className="recovery-intro">
        <div className="icon-tile mint">
          <LifeBuoy size={26} />
        </div>
        <div>
          <h2>Keep the progress you’ve made.</h2>
          <p>
            Recovery preserves authorized evidence and freezes unresolved obligations. Replacement
            work gets a fresh agreement and its own funding.
          </p>
        </div>
        {projectId && data.user.role !== 'FREELANCER' && (
          <Btn onClick={() => dialog({ kind: 'recover', projectId })}>
            Initiate recovery
            <ArrowRight size={16} />
          </Btn>
        )}
      </div>
      {recoveries.length ? (
        <div className="risk-grid">
          {recoveries.map((r) => (
            <Panel
              key={r.id}
              title={data.projects.find((p) => p.id === r.projectId)?.title || 'Recovery case'}
              action={<Badge value={r.status} />}
            >
              <div className="panel-body">
                <p className="preserve-space">{r.reason}</p>
                <div className="detail-pair">
                  <span>Case created</span>
                  <strong>{time(r.createdAt)}</strong>
                </div>
                <div className="detail-pair">
                  <span>Replacement</span>
                  <strong>
                    {data.users.find((u) => u.id === r.replacementId)?.name || 'Not yet invited'}
                  </strong>
                </div>
                <details className="snapshot">
                  <summary>Inspect authorized handover</summary>
                  <pre>{JSON.stringify(r.handover, null, 2)}</pre>
                </details>
                <div className="button-row wrap">
                  <a
                    className="btn secondary"
                    href={`/api/handover/${encodeURIComponent(r.id)}`}
                    download
                  >
                    <Download size={16} />
                    Download handover
                  </a>
                  {data.user.role !== 'FREELANCER' && !r.replacementId && (
                    <Btn
                      onClick={() =>
                        dialog({ kind: 'inviteReplacement', id: r.id, projectId: r.projectId })
                      }
                    >
                      <Users size={16} />
                      Invite replacement
                    </Btn>
                  )}
                  <button
                    className="text-link"
                    onClick={() => openProject(r.projectId, 'agreement')}
                  >
                    Project agreement
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Empty title="No recovery cases" icon={<LifeBuoy size={26} />}>
          If a project needs a new path, initiate recovery from its project page after recording an
          intervention.
        </Empty>
      )}
    </>
  );
}
function DisputeList({
  data,
  disputes,
  dialog,
  openProject,
}: {
  data: Bootstrap;
  disputes: Dispute[];
  dialog: (v: { kind: string; id?: string; projectId?: string }) => void;
  openProject: (id: string, tab?: string) => void;
}) {
  return disputes.length ? (
    <div className="dispute-list">
      {disputes.map((d) => (
        <Panel
          key={d.id}
          title={data.milestones.find((m) => m.id === d.milestoneId)?.title || 'Milestone dispute'}
          subtitle={data.projects.find((p) => p.id === d.projectId)?.title}
          action={<Badge value={d.status} />}
        >
          <div className="panel-body">
            <div className="dispute-reason">
              <Scale size={21} />
              <div>
                <h4>Reason for review</h4>
                <p className="preserve-space">{d.reason}</p>
                <small>
                  Opened {time(d.createdAt)} by{' '}
                  {data.users.find((u) => u.id === d.openedBy)?.name || 'Project participant'}
                </small>
              </div>
            </div>
            {d.statements?.map((s, i) => (
              <div className="statement" key={i}>
                <strong>{data.users.find((u) => u.id === s.userId)?.name || 'Participant'}</strong>
                <small>{time(s.createdAt)}</small>
                <p>{s.text}</p>
              </div>
            ))}
            {d.outcome && (
              <div className="resolution">
                <CheckCircle2 size={20} />
                <div>
                  <strong>{label(d.outcome)}</strong>
                  <p>{d.rationale}</p>
                </div>
              </div>
            )}
            <div className="button-row wrap">
              <button
                className="btn secondary"
                onClick={() => openProject(d.projectId, 'submissions')}
              >
                <FileText size={16} />
                Review evidence
              </button>
              <button
                className="btn secondary"
                onClick={() => openProject(d.projectId, 'agreement')}
              >
                Signed agreement
              </button>
              {d.status !== 'RESOLVED' && (
                <>
                  <Btn kind="secondary" onClick={() => dialog({ kind: 'statement', id: d.id })}>
                    <Send size={15} />
                    Add statement
                  </Btn>
                  {data.user.role === 'ADMIN' && (
                    <Btn onClick={() => dialog({ kind: 'resolve', id: d.id })}>
                      Record resolution
                      <ArrowRight size={16} />
                    </Btn>
                  )}
                </>
              )}
            </div>
          </div>
        </Panel>
      ))}
    </div>
  ) : (
    <Panel title="Dispute center">
      <Empty title="No disputes to review" icon={<Scale size={26} />}>
        A dispute can be raised from an eligible milestone. The affected payment is blocked while it
        is unresolved.
      </Empty>
    </Panel>
  );
}
function Accountability({ data }: { data: Bootstrap }) {
  const freelancers = data.users.filter((u) => u.role === 'FREELANCER');
  return (
    <>
      <PageTitle
        eyebrow="ACCOUNTABILITY PROFILES"
        title="Let the work tell the story."
        description="Transparent records based on the projects visible to your account. No hidden scores or predictive judgments."
      />
      <div className="risk-grid">
        {freelancers.map((u) => {
          const assigned = data.milestones.filter((m) => m.assignedFreelancerId === u.id),
            submitted = data.submissions.filter((s) => s.freelancerId === u.id),
            accepted = assigned.filter(finished),
            onTime = assigned.filter(
              (m) => m.submittedAt && new Date(m.submittedAt) <= new Date(m.dueDate),
            ),
            checkins = data.checkins.filter((c) => c.freelancerId === u.id);
          return (
            <Panel key={u.id} title={u.name} subtitle={u.email}>
              <div className="panel-body">
                <div className="profile-heading">
                  <span className="avatar large">{initials(u.name)}</span>
                  <div>
                    <Badge value="FREELANCER" />
                    <p className="muted small-text">Recorded activity, within your workspace</p>
                  </div>
                </div>
                <div className="account-metrics">
                  <div>
                    <strong>{assigned.length}</strong>
                    <span>Assigned milestones</span>
                  </div>
                  <div>
                    <strong>{accepted.length}</strong>
                    <span>Accepted milestones</span>
                  </div>
                  <div>
                    <strong>{onTime.length}</strong>
                    <span>On-time submissions</span>
                  </div>
                  <div>
                    <strong>{checkins.length}</strong>
                    <span>Progress check-ins</span>
                  </div>
                </div>
                <div className="detail-pair">
                  <span>Submission versions</span>
                  <strong>{submitted.length}</strong>
                </div>
                <div className="detail-pair">
                  <span>Recorded revisions</span>
                  <strong>{assigned.reduce((s, m) => s + m.revisionCount, 0)}</strong>
                </div>
                <div className="detail-pair">
                  <span>Last check-in</span>
                  <strong>{time(checkins[0]?.createdAt)}</strong>
                </div>
                <p className="muted small-text">
                  These counts describe recorded events and are not a rating or a guarantee of
                  future performance.
                </p>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
function Admin({
  data,
  act,
  busy,
  dialog,
}: {
  data: Bootstrap;
  act: (p: ActionPayload) => Promise<unknown>;
  busy: boolean;
  dialog: (v: { kind: string; id?: string; projectId?: string }) => void;
}) {
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION"
        title="The controls behind the confidence."
        description="Review operations, run accountability checks and move the demo clock forward."
      />
      <div className="stats-grid three">
        <Stat
          title="Open disputes"
          value={String(data.disputes.filter((d) => d.status !== 'RESOLVED').length)}
          note="Require an evidence-based resolution"
          icon={<Scale size={19} />}
          color="peach"
        />
        <Stat
          title="Accepted, awaiting release"
          value={String(
            data.milestones.filter((m) => m.status === 'ACCEPTED' && m.paid + m.refunded < m.funded)
              .length,
          )}
          note="Client-authorized payout actions"
          icon={<Wallet size={19} />}
          color="mint"
        />
        <Stat
          title="Payment failures"
          value={String(data.ledger.filter((l) => l.status === 'FAILED').length)}
          note="Recorded in the persistent ledger"
          icon={<AlertTriangle size={19} />}
          color="purple"
        />
      </div>
      <div className="detail-columns">
        <Panel
          title="Accountability engine"
          subtitle="Check deadlines, inactivity and overdue reviews."
        >
          <div className="panel-body form-stack">
            <div className="detail-pair">
              <span>Current application time</span>
              <strong>{time(data.now)}</strong>
            </div>
            <p className="muted">
              Jobs generate recorded reminders and risk signals. A review timeout never releases
              funds by itself.
            </p>
            <Btn disabled={busy} onClick={() => act({ type: 'runJobs' })}>
              <RefreshCw size={16} />
              Run accountability checks
            </Btn>
          </div>
        </Panel>
        {data.demoMode && (
          <Panel title="Demonstration controls" subtitle="Enabled only in explicit demo mode.">
            <div className="panel-body form-stack">
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  act({
                    type: 'advanceClock',
                    hours: Number(new FormData(e.currentTarget).get('hours')),
                  });
                }}
              >
                <Field label="Advance clock by hours">
                  <input name="hours" type="number" min="1" max="720" defaultValue="72" required />
                </Field>
                <Btn type="submit" disabled={busy}>
                  <Clock size={16} />
                  Advance time
                </Btn>
              </form>
              <div className="divider" />
              <p className="muted small-text">
                Reset restores the seeded scenarios and removes current demo projects, submissions
                and transactions.
              </p>
              <Btn kind="danger-outline" onClick={() => dialog({ kind: 'resetDemo' })}>
                Reset demo workspace
              </Btn>
            </div>
          </Panel>
        )}
      </div>
      <div className="stack-top">
        <Panel
          title="Platform audit trail"
          subtitle="Administrative and financial actions are recorded alongside project events."
        >
          <ActivityList data={data} limit={35} />
        </Panel>
      </div>
    </>
  );
}
const templates: Record<
  string,
  {
    title: string;
    scope: string;
    milestones: { title: string; description: string; criteria: string[] }[];
  }
> = {
  'Website Development': {
    title: 'College festival website',
    scope:
      'Create a responsive website for our college festival, with event information, schedule and registration.',
    milestones: [
      {
        title: 'Design & direction',
        description: 'Responsive designs and agreed visual direction.',
        criteria: [
          'Include all agreed pages in the design',
          'Provide mobile and desktop layouts',
          'Use the approved festival branding',
        ],
      },
      {
        title: 'Frontend development',
        description: 'Implement the approved pages and interactions.',
        criteria: [
          'Navigation links work correctly',
          'Pages adapt to mobile and desktop',
          'Registration validates required fields',
        ],
      },
      {
        title: 'Integration & handover',
        description: 'Complete integration, testing and source handover.',
        criteria: [
          'Provide complete source files and setup instructions',
          'Demonstrate the agreed registration flow',
          'Document deployment and known limitations',
        ],
      },
    ],
  },
  'Graphic Design': {
    title: 'Brand identity kit',
    scope: 'Create a consistent visual identity and editable design assets for our small business.',
    milestones: [
      {
        title: 'Creative direction',
        description: 'Moodboard and initial brand concepts.',
        criteria: [
          'Provide three distinct visual concepts',
          'Explain the concept and intended audience',
        ],
      },
      {
        title: 'Final design system',
        description: 'Approved logo and brand assets.',
        criteria: [
          'Deliver vector logo and transparent PNG',
          'Include color codes and typography guidance',
        ],
      },
      {
        title: 'Asset handover',
        description: 'Editable source files and usage guidance.',
        criteria: ['Provide editable source files', 'Export the agreed print and digital formats'],
      },
    ],
  },
  'Video Editing': {
    title: 'Campus event highlight video',
    scope: 'Edit a highlight video from supplied footage with agreed music, titles and captions.',
    milestones: [
      {
        title: 'Rough cut',
        description: 'Initial sequence and narrative direction.',
        criteria: [
          'Use supplied footage and agreed sequence',
          'Provide a preview of the planned running time',
        ],
      },
      {
        title: 'Final edit',
        description: 'Polished edit with captions and audio.',
        criteria: [
          'Include accurate captions',
          'Balance voice and music audio',
          'Use agreed titles and transitions',
        ],
      },
      {
        title: 'Export & handover',
        description: 'Final export and editable project.',
        criteria: [
          'Export at the agreed resolution and frame rate',
          'Deliver editable project and linked asset list',
        ],
      },
    ],
  },
  'Social Media Content': {
    title: 'Launch week content pack',
    scope:
      'Prepare a coordinated launch campaign with social graphics, captions and a publishing calendar.',
    milestones: [
      {
        title: 'Content strategy',
        description: 'Audience, message and content schedule.',
        criteria: [
          'Define the audience and campaign objective',
          'Include a dated publishing calendar',
        ],
      },
      {
        title: 'Content production',
        description: 'Draft the agreed posts and captions.',
        criteria: [
          'Deliver the agreed number of graphics',
          'Include captions and alt text',
          'Use approved branding and platform dimensions',
        ],
      },
      {
        title: 'Final content pack',
        description: 'Approved assets ready to publish.',
        criteria: [
          'Provide editable source designs',
          'Organize final assets by platform and publishing date',
        ],
      },
    ],
  },
  'Presentation or Report Development': {
    title: 'Student venture pitch deck',
    scope:
      'Develop a clear, professionally formatted presentation using supplied research and evidence.',
    milestones: [
      {
        title: 'Story & outline',
        description: 'Agreed narrative and content structure.',
        criteria: ['Include the agreed sections', 'Identify missing evidence and source material'],
      },
      {
        title: 'Draft presentation',
        description: 'Design the full deck or report.',
        criteria: [
          'Use a consistent visual hierarchy',
          'Cite supplied data and sources',
          'Make charts and labels legible',
        ],
      },
      {
        title: 'Review & handover',
        description: 'Final revisions and editable source.',
        criteria: [
          'Deliver editable source and PDF export',
          'Resolve agreed feedback',
          'Check spelling and formatting',
        ],
      },
    ],
  },
};
type DraftMilestone = {
  title: string;
  description: string;
  requirements: string;
  budget: string;
  dueDate: string;
  criteria: string;
  allowedTypes: string;
  maxFileSize: string;
  revisionLimit: string;
  reviewHours: string;
};
function ProjectWizard({
  data,
  busy,
  create,
  back,
}: {
  data: Bootstrap;
  busy: boolean;
  create: (p: ActionPayload) => Promise<void>;
  back: () => void;
}) {
  const today = data.now.slice(0, 10),
    later = new Date(new Date(data.now).getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const [step, setStep] = useState(0),
    [category, setCategory] = useState('Website Development'),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [scope, setScope] = useState(''),
    [freelancerId, setFreelancerId] = useState(''),
    [budget, setBudget] = useState('12000'),
    [startDate, setStartDate] = useState(today),
    [deadline, setDeadline] = useState(later),
    [exclusions, setExclusions] = useState(
      'Hosting fees, paid assets and work outside the agreed scope.',
    ),
    [revisionPolicy, setRevisionPolicy] = useState(
      'Up to 2 revisions per milestone, tied to the agreed acceptance checklist.',
    ),
    [acceptancePolicy, setAcceptancePolicy] = useState(
      'Client reviews within 72 hours. Acceptance is required before a simulated payout.',
    ),
    [disputePolicy, setDisputePolicy] = useState(
      'Either party can raise a dispute. An authorized reviewer evaluates the signed scope and evidence.',
    ),
    [milestones, setMilestones] = useState<DraftMilestone[]>([]),
    [scopeBusy, setScopeBusy] = useState(false),
    [error, setError] = useState('');
  function applyTemplate(name: string) {
    const t = templates[name];
    setCategory(name);
    setTitle(t.title);
    setDescription(t.scope);
    setScope(t.scope);
    const total = Math.round(Number(budget) || 12000),
      base = Math.floor(total / 3);
    setMilestones(
      t.milestones.map((m, i) => ({
        ...m,
        requirements: m.description,
        budget: String(i === 2 ? total - base * 2 : base),
        dueDate: new Date(new Date(data.now).getTime() + (i + 1) * 10 * 86400000)
          .toISOString()
          .slice(0, 10),
        criteria: m.criteria.join('\n'),
        allowedTypes: 'pdf,png,jpg,zip,txt',
        maxFileSize: '10',
        revisionLimit: '2',
        reviewHours: '72',
      })),
    );
  }
  function updateMilestone(i: number, key: keyof DraftMilestone, value: string) {
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, [key]: value } : m)));
  }
  async function scopeDoctor(i: number) {
    setScopeBusy(true);
    setError('');
    try {
      const r = await request('/api/scope', {
        category,
        description: scope + ' ' + milestones[i].description,
      });
      updateMilestone(i, 'criteria', r.criteria.join('\n'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate suggestions.');
    } finally {
      setScopeBusy(false);
    }
  }
  function next(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (step === 0) {
      if (!milestones.length) {
        const t = templates[category];
        const total = Math.round(Number(budget) * 100),
          base = Math.floor(total / 3);
        setMilestones(
          t.milestones.map((m, i) => ({
            ...m,
            requirements: m.description,
            budget: String((i === 2 ? total - base * 2 : base) / 100),
            dueDate: deadline,
            criteria: m.criteria.join('\n'),
            allowedTypes: 'pdf,png,jpg,zip,txt',
            maxFileSize: '10',
            revisionLimit: '2',
            reviewHours: '72',
          })),
        );
      }
      setStep(1);
    } else if (step === 1) {
      if (
        milestones.reduce((s, m) => s + Math.round(Number(m.budget) * 100), 0) !==
        Math.round(Number(budget) * 100)
      ) {
        setError('Milestone budgets must add up exactly to the total project budget.');
        return;
      }
      if (milestones.some((m) => m.dueDate < startDate || m.dueDate > deadline)) {
        setError('Every milestone due date must fall between the project start date and deadline.');
        return;
      }
      setStep(2);
    } else {
      create({
        title,
        description,
        category,
        freelancerId,
        budget: Math.round(Number(budget) * 100),
        currency: 'INR',
        startDate,
        deadline,
        scope,
        exclusions,
        revisionPolicy,
        acceptancePolicy,
        disputePolicy,
        milestones: milestones.map((m) => ({
          ...m,
          budget: Math.round(Number(m.budget) * 100),
          criteria: m.criteria
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          allowedTypes: m.allowedTypes
            .split(',')
            .map((s) => s.trim().replace(/^\./, '').toLowerCase())
            .filter(Boolean),
          maxFileSize: Math.round(Number(m.maxFileSize) * 1024 * 1024),
          revisionLimit: Number(m.revisionLimit),
          reviewHours: Number(m.reviewHours),
        })),
      });
    }
  }
  return (
    <>
      <button className="back-link" onClick={back}>
        <ArrowLeft size={15} />
        Back to projects
      </button>
      <PageTitle
        eyebrow="START WITH A SHARED PLAN"
        title="Build your next milestone."
        description="A clear brief today. A smoother working relationship tomorrow."
      />
      <div className="wizard-steps">
        {['Project essentials', 'Milestones & criteria', 'Review & agreement'].map((s, i) => (
          <div className={i === step ? 'current' : i < step ? 'done' : ''} key={s}>
            <span>{i < step ? <Check size={15} /> : i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <form onSubmit={next} className="wizard-form">
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {step === 0 && (
          <>
            <Panel title="A useful head start" subtitle="Choose a template, then make it your own.">
              <div className="template-grid">
                {Object.keys(templates).map((t, i) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => applyTemplate(t)}
                    className={category === t ? 'selected' : ''}
                  >
                    <span>{['01', '02', '03', '04', '05'][i]}</span>
                    {t}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Project essentials">
              <div className="panel-body form-grid">
                <Field label="Project title">
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. College festival website"
                    maxLength={160}
                  />
                </Field>
                <Field label="Project category">
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {Object.keys(templates).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Invite a freelancer">
                  <select
                    required
                    value={freelancerId}
                    onChange={(e) => setFreelancerId(e.target.value)}
                  >
                    <option value="">Select a registered freelancer</option>
                    {data.users
                      .filter((u) => u.role === 'FREELANCER')
                      .map((u) => (
                        <option value={u.id} key={u.id}>
                          {u.name} · {u.email}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Total budget (INR)">
                  <input
                    required
                    type="number"
                    min="1"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </Field>
                <Field label="Start date">
                  <input
                    required
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </Field>
                <Field label="Final deadline">
                  <input
                    required
                    type="date"
                    min={startDate}
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </Field>
                <div className="span-two">
                  <Field label="Project description">
                    <textarea
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="What are we building, and who is it for?"
                    />
                  </Field>
                </div>
                <div className="span-two">
                  <Field label="Project scope">
                    <textarea
                      required
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      rows={4}
                      placeholder="Describe what the final delivery must include."
                    />
                  </Field>
                </div>
                <div className="span-two">
                  <Field label="Exclusions">
                    <textarea
                      value={exclusions}
                      onChange={(e) => setExclusions(e.target.value)}
                      rows={2}
                    />
                  </Field>
                </div>
              </div>
            </Panel>
          </>
        )}
        {step === 1 && (
          <>
            <div className="wizard-budget">
              <span>
                <Wallet size={19} />
                Total project budget <strong>{money(Math.round(Number(budget) * 100))}</strong>
              </span>
              <span>
                Milestones allocated{' '}
                <strong>
                  {money(milestones.reduce((s, m) => s + Math.round(Number(m.budget) * 100), 0))}
                </strong>
              </span>
            </div>
            {milestones.map((m, i) => (
              <Panel
                key={i}
                title={`Milestone ${i + 1}`}
                action={
                  milestones.length > 1 && (
                    <button
                      type="button"
                      className="muted-link"
                      onClick={() => setMilestones((ms) => ms.filter((_, j) => i !== j))}
                    >
                      Remove
                    </button>
                  )
                }
              >
                <div className="panel-body form-grid">
                  <Field label={`Milestone ${i + 1} title`}>
                    <input
                      required
                      value={m.title}
                      onChange={(e) => updateMilestone(i, 'title', e.target.value)}
                    />
                  </Field>
                  <Field label={`Milestone ${i + 1} budget (INR)`}>
                    <input
                      required
                      type="number"
                      min="1"
                      step="0.01"
                      value={m.budget}
                      onChange={(e) => updateMilestone(i, 'budget', e.target.value)}
                    />
                  </Field>
                  <Field label={`Milestone ${i + 1} due date`}>
                    <input
                      required
                      type="date"
                      min={startDate}
                      max={deadline}
                      value={m.dueDate}
                      onChange={(e) => updateMilestone(i, 'dueDate', e.target.value)}
                    />
                  </Field>
                  <Field label="Description">
                    <input
                      required
                      value={m.description}
                      onChange={(e) => updateMilestone(i, 'description', e.target.value)}
                    />
                  </Field>
                  <div className="span-two">
                    <Field label="Deliverable requirements">
                      <textarea
                        required
                        rows={2}
                        value={m.requirements}
                        onChange={(e) => updateMilestone(i, 'requirements', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="span-two scope-doctor">
                    <div className="scope-doctor-head">
                      <span>
                        <Sparkles size={18} />
                        <strong>Scope Doctor</strong>
                        <small>Rule-based suggestions</small>
                      </span>
                      <Btn kind="secondary" disabled={scopeBusy} onClick={() => scopeDoctor(i)}>
                        {scopeBusy ? (
                          <Loader2 size={15} className="spin" />
                        ) : (
                          <Sparkles size={15} />
                        )}
                        Suggest criteria
                      </Btn>
                    </div>
                    <Field
                      label="Acceptance criteria — one per line"
                      hint="Review and edit these suggestions. They become binding only after both parties accept the agreement."
                    >
                      <textarea
                        required
                        rows={5}
                        value={m.criteria}
                        onChange={(e) => updateMilestone(i, 'criteria', e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="Allowed file extensions">
                    <input
                      required
                      value={m.allowedTypes}
                      onChange={(e) => updateMilestone(i, 'allowedTypes', e.target.value)}
                    />
                  </Field>
                  <Field label="Maximum upload size (MB)">
                    <input
                      required
                      type="number"
                      min="1"
                      max="25"
                      value={m.maxFileSize}
                      onChange={(e) => updateMilestone(i, 'maxFileSize', e.target.value)}
                    />
                  </Field>
                  <Field label="Revision limit">
                    <input
                      required
                      type="number"
                      min="0"
                      max="20"
                      value={m.revisionLimit}
                      onChange={(e) => updateMilestone(i, 'revisionLimit', e.target.value)}
                    />
                  </Field>
                  <Field label="Review window (hours)">
                    <input
                      required
                      type="number"
                      min="1"
                      max="720"
                      value={m.reviewHours}
                      onChange={(e) => updateMilestone(i, 'reviewHours', e.target.value)}
                    />
                  </Field>
                </div>
              </Panel>
            ))}
            <Btn
              kind="secondary"
              onClick={() =>
                setMilestones((ms) => [
                  ...ms,
                  {
                    title: '',
                    description: '',
                    requirements: '',
                    budget: '1',
                    dueDate: deadline,
                    criteria: '',
                    allowedTypes: 'pdf,png,jpg,zip,txt',
                    maxFileSize: '10',
                    revisionLimit: '2',
                    reviewHours: '72',
                  },
                ])
              }
            >
              <Plus size={17} />
              Add milestone
            </Btn>
          </>
        )}
        {step === 2 && (
          <>
            <Panel title="The terms of working together">
              <div className="panel-body form-stack">
                <Field label="Revision policy">
                  <textarea
                    required
                    value={revisionPolicy}
                    onChange={(e) => setRevisionPolicy(e.target.value)}
                  />
                </Field>
                <Field label="Acceptance policy">
                  <textarea
                    required
                    value={acceptancePolicy}
                    onChange={(e) => setAcceptancePolicy(e.target.value)}
                  />
                </Field>
                <Field label="Dispute policy">
                  <textarea
                    required
                    value={disputePolicy}
                    onChange={(e) => setDisputePolicy(e.target.value)}
                  />
                </Field>
              </div>
            </Panel>
            <Panel title="Your project, at a glance">
              <div className="panel-body">
                <h3>{title}</h3>
                <p>{description}</p>
                <div className="detail-pair">
                  <span>Freelancer</span>
                  <strong>{data.users.find((u) => u.id === freelancerId)?.name}</strong>
                </div>
                <div className="detail-pair">
                  <span>Total budget</span>
                  <strong>{money(Math.round(Number(budget) * 100))}</strong>
                </div>
                {milestones.map((m, i) => (
                  <div className="detail-pair" key={i}>
                    <span>
                      {i + 1}. {m.title}
                    </span>
                    <strong>
                      {money(Math.round(Number(m.budget) * 100))} · {date(m.dueDate)}
                    </strong>
                  </div>
                ))}
                <div className="info-strip">
                  <ShieldCheck size={20} />
                  <span>
                    Creating the project generates an immutable agreement version. Both you and the
                    freelancer must accept before funding and work can begin.
                  </span>
                </div>
              </div>
            </Panel>
          </>
        )}
        <div className="wizard-footer">
          <Btn kind="secondary" onClick={() => (step ? setStep(step - 1) : back())}>
            <ArrowLeft size={16} />
            {step ? 'Previous' : 'Cancel'}
          </Btn>
          <Btn type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : step === 2 ? (
              'Create project'
            ) : (
              'Continue'
            )}
            <ArrowRight size={17} />
          </Btn>
        </div>
      </form>
    </>
  );
}
function ActionDialog({
  dialog,
  data,
  close,
  busy,
  act,
  refresh,
  notify,
}: {
  dialog: { kind: string; id?: string; projectId?: string };
  data: Bootstrap;
  close: () => void;
  busy: boolean;
  act: (p: ActionPayload) => Promise<unknown>;
  refresh: () => Promise<Bootstrap>;
  notify: (m: string, error?: boolean) => void;
}) {
  const [localBusy, setLocalBusy] = useState(false),
    [decision, setDecision] = useState('ACCEPT'),
    [outcome, setOutcome] = useState('RELEASE');
  const m = data.milestones.find((v) => v.id === dialog.id),
    d = data.disputes.find((v) => v.id === dialog.id),
    disputed = data.milestones.find((v) => v.id === d?.milestoneId),
    p = data.projects.find((v) => v.id === dialog.projectId),
    latest = m
      ? [...data.submissions.filter((s) => s.milestoneId === m.id)].sort(
          (a, b) => b.version - a.version,
        )[0]
      : undefined;
  const titles: Record<string, string> = {
    upload: 'Submit your deliverable',
    review: 'Review this milestone',
    dispute: 'Raise a milestone dispute',
    statement: 'Add your statement',
    resolve: 'Record an authorized resolution',
    checkin: 'Share a progress update',
    amend: 'Propose an agreement amendment',
    intervene: 'Record an intervention',
    withdraw: 'Request project withdrawal',
    recover: 'Start project recovery',
    inviteReplacement: 'Invite a replacement freelancer',
    rejectAgreement: 'Decline this agreement',
    resetDemo: 'Reset the demonstration workspace',
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (dialog.kind === 'upload') {
      setLocalBusy(true);
      try {
        fd.set('milestoneId', dialog.id!);
        const r = await fetch('/api/uploads', { method: 'POST', body: fd }),
          result = await r.json();
        if (!r.ok) throw new Error(result.error || 'Upload failed.');
        await refresh();
        close();
        notify('Deliverable submitted. Verification and evidence are ready to review.');
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Upload failed.', true);
      } finally {
        setLocalBusy(false);
      }
      return;
    }
    const payload: ActionPayload = { type: dialog.kind, ...Object.fromEntries(fd) };
    if (dialog.projectId) payload.projectId = dialog.projectId;
    if (['review', 'dispute'].includes(dialog.kind)) payload.milestoneId = dialog.id;
    if (['statement', 'resolve'].includes(dialog.kind)) payload.disputeId = dialog.id;
    if (dialog.kind === 'inviteReplacement') payload.recoveryId = dialog.id;
    if (dialog.kind === 'rejectAgreement') payload.agreementId = dialog.id;
    if (dialog.kind === 'resolve') {
      payload.outcome = outcome;
      if (outcome === 'PARTIAL')
        payload.payoutAmount = Math.round(Number(fd.get('payoutAmount')) * 100);
      else delete payload.payoutAmount;
    }
    if (dialog.kind === 'review') payload.decision = decision;
    if (dialog.kind === 'amend') {
      for (const key of ['scope', 'milestoneId', 'dueDate']) if (!payload[key]) delete payload[key];
    }
    await act(payload);
  }
  return (
    <Modal title={titles[dialog.kind] || label(dialog.kind)} close={close}>
      <form className="panel-body form-stack" onSubmit={submit}>
        {dialog.kind === 'upload' && m && (
          <>
            <div className="info-strip">
              <LockKeyhole size={19} />
              <span>Private, versioned evidence. Uploading does not release payment.</span>
            </div>
            <p className="muted">
              For <strong>{m.title}</strong> · Up to {Math.round(m.maxFileSize / 1048576)} MB ·{' '}
              {m.allowedTypes.join(', ')}
            </p>
            <Field label="Deliverable file">
              <input
                required
                type="file"
                name="file"
                accept={m.allowedTypes
                  .map((t) => (t.includes('/') ? t : '.' + t.replace(/^\./, '')))
                  .join(',')}
              />
            </Field>
            <Field label="Description of completed work">
              <textarea
                name="description"
                required
                minLength={10}
                rows={4}
                placeholder="Explain what you delivered and how it meets the agreed checklist."
              />
            </Field>
            <Field label="Repository or preview URL (optional)">
              <input name="url" type="url" placeholder="https://…" />
            </Field>
            <div>
              <h4>Agreed acceptance criteria</h4>
              <ul className="criteria-list">
                {m.criteria.map((c, i) => (
                  <li key={i}>
                    <span />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        {dialog.kind === 'review' && m && (
          <>
            {latest && <SubmissionCard submission={latest} milestone={m} />}
            <Field label="Review decision">
              <select
                name="decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="ACCEPT">Accept the deliverable</option>
                <option value="REVISION">Request a revision</option>
              </select>
            </Field>
            {decision === 'REVISION' && (
              <>
                <Field label="Unmet acceptance criterion">
                  <select name="criterion" required>
                    <option value="">Choose the agreed criterion</option>
                    {m.criteria.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Revision request">
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    rows={4}
                    placeholder="Explain the specific change needed to meet the agreed criterion."
                  />
                </Field>
              </>
            )}
            <label className="checkbox-label">
              <input type="checkbox" required />I have reviewed the deliverable against the signed
              acceptance checklist.
            </label>
            <div className="info-strip">
              <ShieldCheck size={18} />
              <span>
                Acceptance records your decision. A separate simulated payout action confirms the
                release.
              </span>
            </div>
          </>
        )}
        {['dispute', 'recover', 'intervene', 'withdraw', 'rejectAgreement'].includes(
          dialog.kind,
        ) && (
          <>
            <p className="muted">
              {dialog.kind === 'dispute'
                ? 'Explain the issue with reference to the agreed scope and available evidence. This milestone’s unresolved funds remain blocked while the case is open.'
                : dialog.kind === 'recover'
                  ? 'Describe why recovery is needed. Unresolved obligations stay protected, and an authorized handover records the work available for continuation.'
                  : dialog.kind === 'intervene'
                    ? 'Record your outreach, the issue discussed and the requested next step.'
                    : dialog.kind === 'withdraw'
                      ? 'Explain why you cannot continue. Existing payment obligations are preserved for review.'
                      : 'Give a clear reason so the client can propose a better agreement.'}
            </p>
            <Field label="Reason">
              <textarea
                name="reason"
                required
                minLength={10}
                rows={5}
                placeholder="Describe the situation and the next step you’re requesting."
              />
            </Field>
          </>
        )}
        {dialog.kind === 'statement' && (
          <Field label="Your statement">
            <textarea
              name="text"
              required
              minLength={5}
              rows={6}
              placeholder="Provide context, evidence and your proposed resolution."
            />
          </Field>
        )}
        {dialog.kind === 'resolve' && (
          <>
            <div className="info-strip">
              <Scale size={20} />
              <span>
                This is an administrative decision. Review the signed agreement, submission evidence
                and both parties’ statements first.
              </span>
            </div>
            <p className="muted">
              {disputed?.title} · Remaining protected funds:{' '}
              <strong>
                {money((disputed?.funded || 0) - (disputed?.paid || 0) - (disputed?.refunded || 0))}
              </strong>
            </p>
            <Field label="Settlement outcome">
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="RELEASE">Release remaining funds to freelancer</option>
                <option value="REFUND">Refund remaining funds to client</option>
                <option value="PARTIAL">Partial release and refund</option>
                <option value="REVISION">Return work for revision</option>
                <option value="CONTINUE">Continue the existing work</option>
                <option value="CANCEL">Cancel and refund remaining funds</option>
              </select>
            </Field>
            {outcome === 'PARTIAL' && (
              <Field
                label="Amount to release (INR)"
                hint="The remaining protected balance will be refunded to the client."
              >
                <input
                  required
                  name="payoutAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={
                    ((disputed?.funded || 0) - (disputed?.paid || 0) - (disputed?.refunded || 0)) /
                    100
                  }
                />
              </Field>
            )}
            <Field label="Decision rationale">
              <textarea
                name="rationale"
                required
                minLength={10}
                rows={5}
                placeholder="Record the evidence reviewed and why this outcome is supported."
              />
            </Field>
            <label className="checkbox-label">
              <input type="checkbox" required />I have reviewed the agreement and evidence and
              authorize this recorded outcome.
            </label>
          </>
        )}
        {dialog.kind === 'checkin' && (
          <>
            <Field label="Current progress">
              <select name="status">
                <option value="ON_TRACK">On track</option>
                <option value="BLOCKED">Blocked — help needed</option>
                <option value="NEED_EXTENSION">Need a deadline extension</option>
              </select>
            </Field>
            <Field label="Progress update">
              <textarea
                name="comment"
                required
                minLength={5}
                rows={5}
                placeholder="What’s done, what’s next, and is anything blocking progress?"
              />
            </Field>
            <small className="muted">
              An extension request does not change signed deadlines. Submit an amendment for mutual
              approval.
            </small>
          </>
        )}
        {dialog.kind === 'amend' && (
          <>
            <div className="info-strip">
              <FileText size={20} />
              <span>
                An amendment creates a new immutable version and pauses work until both parties
                accept. Financial terms are preserved.
              </span>
            </div>
            <Field label="Reason for amendment">
              <textarea name="reason" required minLength={10} rows={3} />
            </Field>
            <Field label="Updated scope (optional)">
              <textarea name="scope" rows={4} defaultValue={p?.scope} />
            </Field>
            <Field label="Milestone deadline to change (optional)">
              <select name="milestoneId">
                <option value="">Keep existing milestone deadlines</option>
                {data.milestones
                  .filter((m) => m.projectId === dialog.projectId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="New milestone due date (optional)">
              <input
                name="dueDate"
                type="date"
                min={p?.startDate?.slice(0, 10)}
                max={p?.deadline?.slice(0, 10)}
              />
            </Field>
          </>
        )}
        {dialog.kind === 'inviteReplacement' && (
          <>
            <p className="muted">
              The replacement receives fresh milestones and a new agreement. Previous unpaid
              obligations stay frozen for settlement; they do not transfer automatically.
            </p>
            <Field label="Replacement freelancer">
              <select name="freelancerId" required>
                <option value="">Select a freelancer</option>
                {data.users
                  .filter((u) => u.role === 'FREELANCER' && u.id !== p?.freelancerId)
                  .map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.name} · {u.email}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        {dialog.kind === 'resetDemo' && (
          <>
            <div className="form-error">
              This removes current demonstration data and restores all seeded scenarios, including
              demo accounts, project records and transactions.
            </div>
            <label className="checkbox-label">
              <input required type="checkbox" />I understand and want to reset the demo workspace.
            </label>
          </>
        )}
        <div className="modal-actions">
          <Btn kind="secondary" onClick={close}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={busy || localBusy}>
            {busy || localBusy ? (
              <Loader2 className="spin" size={17} />
            ) : dialog.kind === 'review' ? (
              decision === 'ACCEPT' ? (
                'Accept deliverable'
              ) : (
                'Request revision'
              )
            ) : dialog.kind === 'upload' ? (
              'Submit deliverable'
            ) : dialog.kind === 'resolve' ? (
              'Confirm resolution'
            ) : dialog.kind === 'resetDemo' ? (
              'Reset demo'
            ) : (
              'Confirm'
            )}
            <ArrowRight size={16} />
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
