import { MODULES, BRANCHES } from '../lessons';

export const Cats = ({ cats }) => cats.map((c) => <span key={c} className={`cat c-${c.toLowerCase().replace(/\s+/g, '-')}`} title={BRANCHES[c]}>{c}</span>);
import { PALETTE } from '../lib/scenes';
import { pad } from '../App';

const Folder = ({ color }) => (
  <svg className="folder" viewBox="0 0 20 16" aria-hidden="true">
    <path d="M1 3a2 2 0 0 1 2-2h4.5l2 2H17a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill={color} />
  </svg>
);

export default function CourseTree({ lessons, lesson, done, open, myData, ds }) {
  const soonCount = MODULES.reduce((n, m) => n + (m.soon || []).length, 0);
  const doneCount = done.filter((id) => lessons.some((l) => l.id === id)).length;
  return (
    <aside className={`course ${open ? 'open' : ''}`} aria-label="Course outline">
      <div className="course-head"><span>▤ Course</span><small>{lessons.length + soonCount} lessons</small></div>
      <a href={ds ? '#/my-data/explore' : '#/my-data/import'} className={`my-data-link${myData ? ' active' : ''}`}>
        <span className="dz-ic" aria-hidden="true">⛁</span>
        <span><b>My Data</b><small>{ds ? `${ds.name} · ${ds.tables.length} tables` : 'Import your own database'}</small></span>
      </a>
      <nav>
        {MODULES.map((m, mi) => (
          <details key={mi} open={lesson?.mod === m || undefined}>
            <summary>
              <span className="chev">›</span>
              <Folder color={PALETTE[mi % PALETTE.length]} />
              <span className="mname">{pad(mi + 1)}. {m.title}<em className="mtag"><span className="cats"><Cats cats={m.cats} /></span>{m.tag}</em></span>
              <small>{m.lessons.filter((l) => done.includes(l.id)).length}/{m.lessons.length + (m.soon || []).length}</small>
            </summary>
            <ul>
              {m.lessons.map((l) => (
                <li key={l.id}>
                  <a href={`#/${l.id}/1`} className={lesson?.id === l.id ? 'active' : ''} aria-current={lesson?.id === l.id ? 'page' : undefined}>
                    <span className={`file ${done.includes(l.id) ? 'done' : ''}`}>{done.includes(l.id) ? '✓' : ''}</span>{l.title}
                  </a>
                </li>
              ))}
              {(m.soon || []).map((t) => (
                <li key={t}><span className="soon"><span className="file" />{t}<small>soon</small></span></li>
              ))}
            </ul>
          </details>
        ))}
      </nav>
      <div className="progress"><span>PROGRESS</span><b>{doneCount} / {lessons.length}</b></div>
    </aside>
  );
}
