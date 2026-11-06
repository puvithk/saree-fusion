import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiArrowRight, FiLayers, FiBox, FiCpu, FiScissors, FiStar, FiCheckCircle, FiUploadCloud, FiPlayCircle,
} from 'react-icons/fi';
import heroCollage from '../assets/hero-collage.png';
import weavingLoom from '../assets/weaving-loom.png';
import redSaree from '../assets/red-saree.png';
import palluSwatch from '../assets/pallu-swatch.png';
import borderSwatch from '../assets/border-swatch.png';
import bodySwatch from '../assets/body-swatch.png';
import { sareeCategories, latestSarees } from '../data/mockData';

const reveal = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = { show: { transition: { staggerChildren: 0.09 } } };
const inView = { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-60px' } };

const STATS = [
  { value: '3', label: 'Components fused' },
  { value: '60s', label: 'Idea to drape preview' },
  { value: '3', label: 'Loom formats exported' },
];

const STEPS = [
  { icon: <FiUploadCloud />, title: 'Choose components', text: 'Pick a body motif, border and pallu — or upload your own swatches.', img: bodySwatch },
  { icon: <FiLayers />, title: 'Fuse with AI', text: 'Our engine blends them into continuous, loom-aware saree designs.', img: borderSwatch },
  { icon: <FiBox />, title: 'Preview the drape', text: 'See it on a mannequin and tune colours in the live studio.', img: palluSwatch },
  { icon: <FiCpu />, title: 'Weave it', text: 'Export Jacquard and dobby files ready for your weaver.', img: weavingLoom },
];

const FEATURES = [
  { icon: <FiLayers />, title: 'Component-level design', text: 'Mix and match body, border and pallu independently, keeping borders continuous top to bottom.' },
  { icon: <FiBox />, title: 'Photoreal drape preview', text: 'Review every design on a draped mannequin with full zoom and a flat template view.' },
  { icon: <FiScissors />, title: 'Loom-ready exports', text: 'One click to .jac, .wif and .dob files plus a printable tech-pack.' },
  { icon: <FiStar />, title: 'Heritage, personalised', text: 'Traditional craft and modern tooling, built for weavers and designers alike.' },
];

export default function Home() {
  return (
    <div className="hp">
      {/* ---------- Hero ---------- */}
      <section className="hp-hero">
        <div className="hp-hero-glow" aria-hidden="true" />
        <div className="hp-wrap hp-hero-grid">
          <motion.div className="hp-hero-copy" variants={stagger} initial="hidden" animate="show">
            <motion.span variants={reveal} className="hp-eyebrow">
              <FiStar /> Where expectations meet excellence
            </motion.span>
            <motion.h1 variants={reveal} className="hp-h1">
              Design your perfect saree, <span className="hp-grad">woven to order.</span>
            </motion.h1>
            <motion.p variants={reveal} className="hp-lead">
              Blend body, border and pallu into a one-of-a-kind drape — preview it instantly and send
              loom-ready files straight to your weaver.
            </motion.p>
            <motion.div variants={reveal} className="hp-cta-row">
              <Link to="/design" className="hp-btn hp-btn-primary">Start designing <FiArrowRight /></Link>
              <Link to="/collections" className="hp-btn hp-btn-ghost"><FiPlayCircle /> View collection</Link>
            </motion.div>
            <motion.ul variants={reveal} className="hp-stats">
              {STATS.map((s) => (
                <li key={s.label}><strong>{s.value}</strong><span>{s.label}</span></li>
              ))}
            </motion.ul>
          </motion.div>

          <motion.div
            className="hp-hero-art"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <div className="hp-arch">
              <img src={redSaree} alt="Red banarasi saree with peacock border" />
            </div>
            <div className="hp-float hp-float-a">
              <img src={palluSwatch} alt="" /><span><b>Pallu</b>P1</span>
            </div>
            <div className="hp-float hp-float-b">
              <img src={borderSwatch} alt="" /><span><b>Border</b>BR2</span>
            </div>
            <div className="hp-float hp-float-c">
              <FiCheckCircle /><span><b>98% match</b>Production ready</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- Trust strip ---------- */}
      <div className="hp-strip" aria-label="What you get">
        <div className="hp-wrap hp-strip-row">
          <span><FiCheckCircle /> Jacquard &amp; dobby ready</span>
          <span><FiCheckCircle /> Continuous borders</span>
          <span><FiCheckCircle /> Live drape preview</span>
          <span><FiCheckCircle /> Printable tech-pack</span>
        </div>
      </div>

      {/* ---------- How it works ---------- */}
      <section className="hp-section">
        <div className="hp-wrap">
          <motion.div className="hp-head" {...inView} variants={reveal}>
            <span className="hp-kicker">How it works</span>
            <h2 className="hp-h2">From swatch to saree in four steps</h2>
            <p className="hp-sub">A guided flow that keeps you in creative control and your weaver in the loop.</p>
          </motion.div>
          <motion.ol className="hp-steps" {...inView} variants={stagger}>
            {STEPS.map((s, i) => (
              <motion.li key={s.title} variants={reveal} className="hp-step">
                <div className="hp-step-img"><img src={s.img} alt="" loading="lazy" /><span className="hp-step-num">{i + 1}</span></div>
                <div className="hp-step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      {/* ---------- Create / customise / wear ---------- */}
      <section className="hp-section hp-band">
        <div className="hp-wrap hp-split">
          <motion.div className="hp-split-art" {...inView} variants={reveal}>
            <img src={heroCollage} alt="Silk sarees in red, blue, gold and green" loading="lazy" />
          </motion.div>
          <motion.div className="hp-split-copy" {...inView} variants={stagger}>
            <motion.span variants={reveal} className="hp-kicker">Create · Customise · Wear</motion.span>
            <motion.h2 variants={reveal} className="hp-h2">One studio for every saree you imagine</motion.h2>
            <motion.p variants={reveal} className="hp-sub">
              Use the studio to design a saree that is uniquely yours — then keep every version
              organised in your collection.
            </motion.p>
            <motion.ul variants={reveal} className="hp-ticks">
              <li><FiCheckCircle /> AI-assisted fusion of your own components</li>
              <li><FiCheckCircle /> Side-by-side drape and template views</li>
              <li><FiCheckCircle /> Re-open any design in the simulation studio</li>
            </motion.ul>
            <motion.div variants={reveal}>
              <Link to="/design" className="hp-btn hp-btn-primary">Open the studio <FiArrowRight /></Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="hp-section">
        <div className="hp-wrap">
          <motion.div className="hp-head" {...inView} variants={reveal}>
            <span className="hp-kicker">Why SareeFusion</span>
            <h2 className="hp-h2">Built for designers, weavers and wearers</h2>
          </motion.div>
          <motion.div className="hp-features" {...inView} variants={stagger}>
            {FEATURES.map((f) => (
              <motion.article key={f.title} variants={reveal} className="hp-feature" whileHover={{ y: -6 }}>
                <span className="hp-feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------- Categories ---------- */}
      <section className="hp-section hp-band">
        <div className="hp-wrap">
          <div className="hp-head hp-head-row">
            <div>
              <span className="hp-kicker">Explore our work</span>
              <h2 className="hp-h2">Shop the latest collection</h2>
            </div>
            <Link to="/sarees" className="hp-link">View all <FiArrowRight /></Link>
          </div>
          <motion.div className="hp-cats" {...inView} variants={stagger}>
            {sareeCategories.map((cat) => (
              <motion.div key={cat.name} variants={reveal}>
                <Link to="/sarees" className="hp-cat">
                  <img src={cat.image} alt="" loading="lazy" />
                  <span className="hp-cat-label">{cat.name}<FiArrowRight /></span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------- Latest sarees ---------- */}
      <section className="hp-section">
        <div className="hp-wrap">
          <div className="hp-head hp-head-row">
            <div>
              <span className="hp-kicker">New arrivals</span>
              <h2 className="hp-h2">Latest sarees</h2>
            </div>
            <Link to="/sarees" className="hp-link">Browse sarees <FiArrowRight /></Link>
          </div>
          <motion.div className="hp-products" {...inView} variants={stagger}>
            {latestSarees.slice(0, 4).map((s) => (
              <motion.div key={s.id} variants={reveal}>
                <Link to="/sarees" className="hp-product">
                  <div className="hp-product-img">
                    <img src={s.image} alt={s.name} loading="lazy" />
                    <span className="hp-badge">{s.matchPercent}</span>
                  </div>
                  <div className="hp-product-body">
                    <h3>{s.name}</h3>
                    <p>{s.id} · {s.tags.join(' · ')}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="hp-section hp-cta-section">
        <motion.div className="hp-wrap hp-cta" {...inView} variants={reveal}>
          <div>
            <h2>Ready to weave something that is yours?</h2>
            <p>Start with three swatches. Leave with a loom-ready saree design.</p>
          </div>
          <Link to="/design" className="hp-btn hp-btn-light">Start designing <FiArrowRight /></Link>
        </motion.div>
      </section>
    </div>
  );
}
