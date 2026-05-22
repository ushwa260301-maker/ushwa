type ToolStatus = "active" | "beta" | "development" | "planned";

type Tool = {
  id: string;
  emoji: string;
  name: string;
  description: string;
  href?: string;
};

type Section = {
  title: string;
  dotClass: string;
  status: ToolStatus;
  tools: Tool[];
};

const STATUS_LABEL: Record<ToolStatus, string> = {
  active: "사용 중",
  beta: "베타테스트",
  development: "개발 중",
  planned: "계획 중",
};

const STATUS_BADGE: Record<ToolStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  beta: "bg-blue-100 text-blue-700 border-blue-200",
  development: "bg-amber-100 text-amber-700 border-amber-200",
  planned: "bg-slate-100 text-slate-600 border-slate-200",
};

const SECTIONS: Section[] = [
  {
    title: "사용 중인 도구",
    dotClass: "bg-emerald-500",
    status: "active",
    tools: [
      {
        id: "sumu-storage",
        emoji: "📦",
        name: "자재 관리 시스템",
        description: "자재 재고 관리 및 발주",
        href: "https://sumu-storage.lovable.app/",
      },
      {
        id: "sumu-scheduler",
        emoji: "📅",
        name: "시공 스케줄러",
        description: "시공 일정 관리 및 스케줄링",
        href: "https://sumu-scheduler.lovable.app/",
      },
    ],
  },
  {
    title: "베타테스트 중인 도구",
    dotClass: "bg-blue-500",
    status: "beta",
    tools: [
      {
        id: "rnd-tool",
        emoji: "🔬",
        name: "R&D 도구",
        description: "연구 개발 지원 도구",
        href: "https://sumu-rnd-tool.onrender.com/",
      },
      {
        id: "sumu-estimate",
        emoji: "📝",
        name: "견적서 작성",
        description: "프로젝트 견적서 작성 및 관리",
        href: "https://sumu-estimate.lovable.app/",
      },
    ],
  },
  {
    title: "개발 중인 도구",
    dotClass: "bg-amber-500",
    status: "development",
    tools: [
      {
        id: "google-drive-organizer",
        emoji: "📁",
        name: "Google Drive 정리",
        description: "구글 드라이브 파일 자동 정리 도구",
      },
      {
        id: "ppt-archiving",
        emoji: "📊",
        name: "PPT 아카이빙",
        description: "프레젠테이션 파일 분류 및 아카이빙",
      },
      {
        id: "slack-notion-bot",
        emoji: "🤖",
        name: "Slack-Notion 봇",
        description: "슬랙과 노션 연동 자동화",
      },
    ],
  },
  {
    title: "계획 중인 도구",
    dotClass: "bg-slate-400",
    status: "planned",
    tools: [
      {
        id: "project-dashboard",
        emoji: "📋",
        name: "프로젝트 대시보드",
        description: "진행 중인 프로젝트 현황 한눈에 보기",
      },
    ],
  },
];

const USER = {
  name: "최승빈",
  email: "b1nz@sumu.kr",
  role: "멤버",
  avatar:
    "https://lh3.googleusercontent.com/a/ACg8ocKqKymYZ-C64mLINzSUYa4l0-rVA-nYgofx_BmqXPEiiz98wx0=s96-c",
};

function ExternalLinkHint() {
  return (
    <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
      외부 링크
    </div>
  );
}

function ToolCard({ tool, status }: { tool: Tool; status: ToolStatus }) {
  const badge = (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full border ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );

  if (tool.href) {
    return (
      <a href={tool.href} target="_blank" rel="noopener noreferrer">
        <div className="group relative bg-white rounded-xl border-2 border-slate-100 p-6 transition-all duration-200 hover:border-slate-200 hover:shadow-lg cursor-pointer">
          <div className="flex items-start justify-between mb-4">
            <span className="text-4xl">{tool.emoji}</span>
            {badge}
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">
            {tool.name}
          </h3>
          <p className="text-sm text-slate-500">{tool.description}</p>
          <ExternalLinkHint />
        </div>
      </a>
    );
  }

  return (
    <div className="group relative bg-white rounded-xl border-2 border-slate-100 p-6 transition-all duration-200 opacity-50 cursor-not-allowed">
      <div className="flex items-start justify-between mb-4">
        <span className="text-4xl">{tool.emoji}</span>
        {badge}
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2 transition-colors">
        {tool.name}
      </h3>
      <p className="text-sm text-slate-500">{tool.description}</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="Sumu" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold text-slate-800">내부 도구 포털</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-2 justify-end">
                {USER.name}
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  {USER.role}
                </span>
              </p>
              <p className="text-xs text-slate-500">{USER.email}</p>
            </div>
            <img
              src={USER.avatar}
              alt="Profile"
              className="w-10 h-10 rounded-full border-2 border-slate-200"
            />
            <form action="/api/logout" method="POST">
              <button
                type="submit"
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {SECTIONS.map((section) => (
          <section key={section.title} className="mb-12">
            <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${section.dotClass}`} />
              {section.title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} status={section.status} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <p className="text-sm text-slate-400 text-center">
            회사 내부 전용 - 권한 없는 접근 금지
          </p>
        </div>
      </footer>
    </div>
  );
}
