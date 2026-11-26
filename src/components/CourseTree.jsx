import { MODULES, BRANCHES } from '../lessons';
import { BookOpen, Database, Check, ChevronRight, Folder as FolderIcon } from 'lucide-react';

export const Cats = ({ cats }) => cats.map((c) => <span key={c} className={`cat c-${c.toLowerCase().replace(/\s+/g, '-')}`} title={BRANCHES[c]}>{c}</span>);
import { PALETTE } from '../lib/scenes';
import { pad } from '../App';

const Folder = ({ color }) => <FolderIcon className="folder" aria-hidden="true" style={{ fill: color, color }} />;

export default function CourseTree({ lessons, lesson, done, open, myData, ds }) {
  const soonCount = MODULES.reduce((n, m) => n + (m.soon || []).length, 0);
  const doneCount = done.filter((id) => lessons.some((l) => l.id === id)).length;
  return (
    <aside className={`course ${open ? 'open' : ''}`} aria-label="Course outline">
      <div className="course-head"><span><BookOpen /> Course</span><small>{lessons.length + soonCount} lessons</small></div>
      <a href={ds ? '#/my-data/explore' : '#/my-data/import'} className={`my-data-link${myData ? ' active' : ''}`}>
        <span className="dz-ic" aria-hidden="true"><Database /></span>
        <span><b>My Data</b><small>{ds ? `${ds.name} · ${ds.tables.length} tables` : 'Import your own database'}</small></span>
      </a>
      <nav>
        {MODULES.map((m, mi) => (
          <details key={mi} open={lesson?.mod === m || undefined}>
            <summary>
              <span className="chev"><ChevronRight /></span>
              <Folder color={PALETTE[mi % PALETTE.length]} />
              <span className="mname">{pad(mi + 1)}. {m.title}<em className="mtag"><span className="cats"><Cats cats={m.cats} /></span>{m.tag}</em></span>
              <small>{m.lessons.filter((l) => done.includes(l.id)).length}/{m.lessons.length + (m.soon || []).length}</small>
            </summary>
            <ul>
              {m.lessons.map((l) => (
                <li key={l.id}>
                  <a href={`#/${l.id}/1`} className={lesson?.id === l.id ? 'active' : ''} aria-current={lesson?.id === l.id ? 'page' : undefined}>
                    <span className={`file ${done.includes(l.id) ? 'done' : ''}`}>{done.includes(l.id) && <Check />}</span>{l.title}
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
