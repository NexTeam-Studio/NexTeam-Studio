import React, { useState } from "react";

/** Complete, authoritative shared hero-quote rotation. */
export const HERO_QUOTES: Array<{ text: string; author: string }> = [
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Your most unhappy customers are your greatest source of learning.", author: "Bill Gates" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "If you really look closely, most overnight successes took a long time.", author: "Steve Jobs" },
  { text: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
  { text: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill" },
  { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { text: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller" },
  { text: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
  { text: "The only place where success comes before work is in the dictionary.", author: "Vidal Sassoon" },
  { text: "Chase the vision, not the money; the money will end up following you.", author: "Tony Hsieh" },
  { text: "If you are not embarrassed by the first version of your product, you've launched too late.", author: "Reid Hoffman" },
  { text: "Ideas are easy. Implementation is hard.", author: "Guy Kawasaki" },
  { text: "Business opportunities are like buses, there's always another one coming.", author: "Richard Branson" },
  { text: "Your brand is what other people say about you when you're not in the room.", author: "Jeff Bezos" },
  { text: "When something is important enough, you do it even if the odds are not in your favor.", author: "Elon Musk" },
  { text: "Don't be intimidated by what you don't know. That can be your greatest strength.", author: "Sara Blakely" },
  { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
  { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
  { text: "I never dreamed about success. I worked for it.", author: "Estée Lauder" },
  { text: "People are definitely a company's greatest asset.", author: "Mary Kay Ash" },
  { text: "We are living in a culture where burnout is worn as a badge of honor.", author: "Arianna Huffington" },
  { text: "High expectations are the key to everything.", author: "Sam Walton" },
  { text: "It's fine to celebrate success but it is more important to heed the lessons of failure.", author: "Bill Gates" },
  { text: "There is only one boss. The customer.", author: "Sam Walton" },
  { text: "Quality is more important than quantity. One home run is much better than two doubles.", author: "Steve Jobs" },
  { text: "A goal is not always meant to be reached, it often serves simply as something to aim at.", author: "Bruce Lee" },
  { text: "The competitor to be feared is one who never bothers about you at all, but goes on making his own business better all the time.", author: "Henry Ford" },
  { text: "Don't worry about failure; you only have to be right once.", author: "Drew Houston" },
  { text: "I think it is possible for ordinary people to choose to be extraordinary.", author: "Elon Musk" },
  { text: "It's not about ideas. It's about making ideas happen.", author: "Scott Belsky" },
  { text: "The biggest risk is not taking any risk.", author: "Mark Zuckerberg" },
  { text: "In business, you don't get what you deserve, you get what you negotiate.", author: "Chester L. Karrass" },
  { text: "You miss 100 percent of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "The way I see it, if you want the rainbow, you gotta put up with the rain.", author: "Dolly Parton" },
  { text: "I have never worked a day in my life without selling. If I believe in something, I sell it, and I sell it hard.", author: "Estée Lauder" },
  { text: "Formal education will make you a living; self-education will make you a fortune.", author: "Jim Rohn" },
  { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
  { text: "Setting goals is the first step in turning the invisible into the visible.", author: "Tony Robbins" },
  { text: "Build something 100 people love, not something 1 million people kind of like.", author: "Brian Chesky" },
  { text: "Winning isn't everything, but wanting to win is.", author: "Vince Lombardi" },
  { text: "A real entrepreneur is somebody who has no safety net underneath them.", author: "Henry Kravis" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Do not go where the path may lead, go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Vision without execution is just hallucination.", author: "Thomas Edison" },
  { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
  { text: "Great things in business are never done by one person; they're done by a team of people.", author: "Steve Jobs" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "If you double the number of experiments you do per year, you're going to double your inventiveness.", author: "Jeff Bezos" },
  { text: "You can't build a reputation on what you are going to do.", author: "Henry Ford" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "Adversity is the best teacher.", author: "Confucius" },
  { text: "The supreme art of war is to subdue the enemy without fighting.", author: "Sun Tzu" },
  { text: "I've missed more than 9,000 shots in my career... and that is why I succeed.", author: "Michael Jordan" },
  { text: "Champions keep playing until they get it right.", author: "Billie Jean King" },
  { text: "The mind is everything. What you think you become.", author: "Buddha" },
  { text: "If you can't explain it simply, you don't understand it well enough.", author: "Albert Einstein" },
  { text: "Do the one thing you think you cannot do. Fail at it. Try again.", author: "Oprah Winfrey" },
  { text: "Not how long, but how well you have lived is the main thing.", author: "Seneca" },
  { text: "The cave you fear to enter holds the treasure you seek.", author: "Joseph Campbell" },
  { text: "You can't cross the sea merely by standing and staring at the water.", author: "Rabindranath Tagore" },
  { text: "A person who never made a mistake never tried anything new.", author: "Albert Einstein" },
  { text: "Leadership is the capacity to translate vision into reality.", author: "Warren Bennis" },
  { text: "Management is doing things right; leadership is doing the right things.", author: "Peter Drucker" },
  { text: "The function of leadership is to produce more leaders, not more followers.", author: "Ralph Nader" },
  { text: "Do not wait for leaders; do it alone, person to person.", author: "Mother Teresa" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Only those who dare to fail greatly can ever achieve greatly.", author: "Robert F. Kennedy" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Hire character. Train skill.", author: "Peter Schutz" },
  { text: "Culture eats strategy for breakfast.", author: "Peter Drucker" },
  { text: "It's not the customer's job to know what they want.", author: "Steve Jobs" },
  { text: "Startups don't grow because you polish them. They grow because you find what works and pour gasoline on it.", author: "Sam Altman" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "The pessimist sees difficulty in every opportunity. The optimist sees opportunity in every difficulty.", author: "Winston Churchill" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "You are not your resume, you are your work.", author: "Seth Godin" },
  { text: "Marketing is no longer about the stuff that you make, but about the stories you tell.", author: "Seth Godin" },
  { text: "People don't buy what you do; they buy why you do it.", author: "Simon Sinek" },
  { text: "Start with why.", author: "Simon Sinek" },
  { text: "If people are doubting how far you can go, go so far that you can't hear them anymore.", author: "Michele Ruiz" },
  { text: "It's hard to beat a person who never gives up.", author: "Babe Ruth" },
  { text: "Obstacles don't have to stop you. If you run into a wall, don't turn around and give up.", author: "Michael Jordan" },
  { text: "Do what you love and success will follow. Passion is the fuel behind a successful career.", author: "Meg Whitman" },
  { text: "There is no passion to be found playing small — in settling for a life that is less than the one you are capable of living.", author: "Nelson Mandela" },
  { text: "Whatever you can do, or dream you can, begin it. Boldness has genius, power, and magic in it.", author: "Johann Wolfgang von Goethe" },
  { text: "The road to success and the road to failure are almost exactly the same.", author: "Colin R. Davis" },
  { text: "You must expect great things of yourself before you can do them.", author: "Michael Jordan" },
  { text: "Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did do.", author: "Mark Twain" },
  { text: "The reasonable man adapts himself to the world; the unreasonable one persists in trying to adapt the world to himself.", author: "George Bernard Shaw" },
  { text: "It is not the strongest of the species that survives, but the one most responsive to change.", author: "Charles Darwin" },
  { text: "What you get by achieving your goals is not as important as what you become by achieving your goals.", author: "Zig Ziglar" },
  { text: "The greatest danger for most of us is not that our aim is too high and we miss it, but that it is too low and we reach it.", author: "Michelangelo" },
  { text: "Try not to become a person of success, but rather try to become a person of value.", author: "Albert Einstein" },
  { text: "Efficiency is doing things right; effectiveness is doing the right things.", author: "Peter Drucker" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Rohn" },
  { text: "We become what we repeatedly do.", author: "Sean Covey" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "The way to develop self-confidence is to do the thing you fear.", author: "William Jennings Bryan" },
  { text: "Courage is resistance to fear, mastery of fear, not absence of fear.", author: "Mark Twain" },
  { text: "If you are working on something exciting that you really care about, you don't have to be pushed. The vision pulls you.", author: "Steve Jobs" },
  { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { text: "Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work.", author: "Steve Jobs" },
  { text: "I skate to where the puck is going to be, not where it has been.", author: "Wayne Gretzky" },
  { text: "The best revenge is massive success.", author: "Frank Sinatra" },
  { text: "There are no traffic jams along the extra mile.", author: "Roger Staubach" },
  { text: "It's not what you achieve, it's what you overcome. That's what defines your career.", author: "Carlton Fisk" },
  { text: "A ship in harbor is safe, but that is not what ships are built for.", author: "John A. Shedd" },
  { text: "Do not be embarrassed by your failures, learn from them and start again.", author: "Richard Branson" },
  { text: "A business that makes nothing but money is a poor business.", author: "Henry Ford" },
  { text: "Even if you're on the right track, you'll get run over if you just sit there.", author: "Will Rogers" },
  { text: "There's no shortage of remarkable ideas, what's missing is the will to execute them.", author: "Seth Godin" },
  { text: "Build a name for yourself by helping other people build their names.", author: "Guy Kawasaki" },
  { text: "In business, the idea of measuring what you are doing, picking the measurements that count, is probably the most undervalued discipline.", author: "Jim Barksdale" },
  { text: "Fail fast, fail often, but always fail forward.", author: "John C. Maxwell" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { text: "It's not about money or connections — it's the willingness to outwork and outlearn everyone.", author: "Mark Cuban" },
  { text: "You don't need to be a genius or a visionary or even a college graduate to be successful. You need a framework and a dream.", author: "Michael Dell" },
  { text: "The successful man will profit from his mistakes and try again in a different way.", author: "Dale Carnegie" },
  { text: "Winners are not afraid of losing. But losers are. Failure is part of the process of success.", author: "Robert T. Kiyosaki" },
  { text: "I like to listen. I have learned a great deal from listening carefully.", author: "Ernest Hemingway" },
  { text: "The trick is not minding that it hurts.", author: "T.E. Lawrence" },
  { text: "As long as you're going to be thinking anyway, think big.", author: "Donald Trump" },
  { text: "If you don't build your dream, someone else will hire you to help them build theirs.", author: "Dhirubhai Ambani" },
  { text: "Take up one idea. Make that one idea your life.", author: "Swami Vivekananda" },
  { text: "You just can't beat the person who never gives up.", author: "Babe Ruth" },
  { text: "A person who won't read has no advantage over one who can't read.", author: "Mark Twain" },
  { text: "The two most important days in your life are the day you are born and the day you find out why.", author: "Mark Twain" },
  { text: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill" },
  { text: "Think and grow rich.", author: "Napoleon Hill" },
  { text: "Riches begin with a state of mind, with definiteness of purpose.", author: "Napoleon Hill" },
  { text: "If you can dream it, you can do it.", author: "Walt Disney" },
  { text: "All our dreams can come true, if we have the courage to pursue them.", author: "Walt Disney" },
  { text: "It's kind of fun to do the impossible.", author: "Walt Disney" },
  { text: "Somewhere, something incredible is waiting to be known.", author: "Carl Sagan" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Details create the big picture.", author: "Sanford I. Weill" },
  { text: "Do the hard jobs first. The easy jobs will take care of themselves.", author: "Dale Carnegie" },
  { text: "The elevator to success is out of order. You'll have to use the stairs, one step at a time.", author: "Joe Girard" },
  { text: "Nothing is particularly hard if you divide it into small jobs.", author: "Henry Ford" },
  { text: "A goal properly set is halfway reached.", author: "Zig Ziglar" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" }
];

// The quote array is intentionally maintained here as the single shared hero source.
// It intentionally rotates a broad collection rather than repeating a narrow set.
function stableQuoteIndex(seed: string): number {
  return Array.from(seed).reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0) % HERO_QUOTES.length;
}

function HeroQuote({ title }: { title: string }): React.ReactElement {
  const [index, setIndex] = React.useState(() => stableQuoteIndex(title));
  React.useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % HERO_QUOTES.length), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const quote = HERO_QUOTES[index] ?? HERO_QUOTES[0];
  return <blockquote className="module-hero-card__quote"><p>“{quote.text}”</p><cite>— {quote.author}</cite></blockquote>;
}

/**
 * Shared Layout Part for roster Pages. Consumers supply their own module
 * icon, copy, and actions; this component owns the shared hero structure.
 */
export function ModuleHeroCard(props: {
  eyebrow?: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <header className={`nexops-business-hero module-hero-card${props.className ? ` ${props.className}` : ""}`}>
      <div className="module-hero-card__copy">
        {props.eyebrow ? <p className="nexops-business-eyebrow">{props.eyebrow}</p> : null}
        <div className="module-hero-card__title">
          <span className="module-hero-card__icon" aria-hidden="true">{props.icon}</span>
          <h1>{props.title}</h1>
        </div>
        <HeroQuote title={props.title} />
      </div>
      {props.primaryAction || props.secondaryActions ? (
        <div className="nexops-business-hero-action module-hero-card__actions">
          {props.primaryAction ? <div className="module-hero-card__primary-action">{props.primaryAction}</div> : null}
          {props.secondaryActions ? <div className="module-hero-card__secondary-actions">{props.secondaryActions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Shared visual structure for primary NexOps business rails. Object modules
 * provide their domain data; this Page Template owns the roster rhythm.
 */
export function NexOpsRosterTemplate(props: {
  eyebrow?: string;
  title: string;
  detail: string;
  icon?: React.ReactNode;
  metrics?: React.ReactNode;
  controls?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  heroClassName?: string;
  showHero?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-business-template nexops-roster-template">
      {props.showHero === false ? null : <ModuleHeroCard
        eyebrow={props.eyebrow}
        title={props.title}
        detail={props.detail}
        icon={props.icon ?? null}
        primaryAction={props.primaryAction}
        secondaryActions={props.secondaryActions}
        className={props.heroClassName}
      />}
      {props.metrics ? <div className="nexops-business-metrics">{props.metrics}</div> : null}
      {props.controls ? <div className="nexops-business-controls">{props.controls}</div> : null}
      <div className="nexops-business-content">{props.children}</div>
    </section>
  );
}

/**
 * Shared Layout Part for the interactive portion of a roster Page.  Every
 * consumer supplies domain data and actions only; this component owns the
 * Search, Filter, and Results hierarchy used by the approved Quotes roster.
 */
export function NexOpsRosterSurface(props: {
  ariaLabel: string;
  searchTitle: string;
  search: React.ReactNode;
  filter?: React.ReactNode;
  filterOptions?: React.ReactNode;
  resultCount: number;
  resultNoun: string;
  /** Results remain hidden until a consuming page has an active query or filter. */
  showResults?: boolean;
  children: React.ReactNode;
  empty?: React.ReactNode;
}): React.ReactElement {
  const [hasResultsQuery, setHasResultsQuery] = useState(false);
  const resultsVisible = props.showResults ?? hasResultsQuery;

  function synchronizeResultsVisibility(event: React.SyntheticEvent<HTMLElement>): void {
    const surface = event.currentTarget;
    window.requestAnimationFrame(() => {
      const hasSearchText = Array.from(surface.querySelectorAll<HTMLInputElement>("input[type=search], input[type=text]"))
        .some((input) => input.value.trim().length > 0);
      const hasSelectedNativeFilter = Array.from(surface.querySelectorAll<HTMLSelectElement>("select"))
        .some((select) => Boolean(select.value) && select.value !== "all");
      const hasSelectedButtonFilter = Boolean(surface.querySelector('[role="radio"][aria-checked="true"], [role="checkbox"][aria-checked="true"]'));
      setHasResultsQuery(hasSearchText || hasSelectedNativeFilter || hasSelectedButtonFilter);
    });
  }

  return (
    <>
      <section className="nexops-business-hero module-hero-card--quote nexops-quote-roster-filters" aria-label={props.ariaLabel} onInputCapture={synchronizeResultsVisibility} onChangeCapture={synchronizeResultsVisibility} onClickCapture={synchronizeResultsVisibility}>
        <h2>{props.searchTitle}</h2>
        {props.search}
        {props.filter ?? null}
        {props.filterOptions}
      </section>
      {!resultsVisible ? null : <section className="nexops-quote-filtered-roster" aria-label={`${props.resultNoun} results`}>
        <div className="nexops-quote-filtered-roster-heading">
          <h2>{props.resultCount} {props.resultCount === 1 ? "Result" : "Results"}</h2>
        </div>
        <div className="nexops-quote-filtered-table">
          <div className="nexops-quote-filtered-list">{props.children}</div>
          {props.empty}
        </div>
      </section>}
    </>
  );
}

/**
 * Shared Page Template for create/composer Pages. Consumers supply their
 * domain workflow as children while this template owns the creation Hero,
 * back action region, and creation content frame.
 */
export function NexOpsCreationTemplate(props: {
  eyebrow?: string;
  title: string;
  detail: string;
  icon?: React.ReactNode;
  backAction: React.ReactNode;
  heroClassName?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-business-template nexops-creation-template">
      <ModuleHeroCard
        eyebrow={props.eyebrow}
        title={props.title}
        detail={props.detail}
        icon={props.icon ?? null}
        primaryAction={props.backAction}
        className={props.heroClassName}
      />
      <div className="nexops-creation-content">{props.children}</div>
    </section>
  );
}

export function NexOpsDetailTemplate(props: {
  back: React.ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  navigation?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="nexops-business-template nexops-detail-template">
      <div className="nexops-business-back">{props.back}</div>
      <header className="nexops-business-hero nexops-business-detail-hero">
        <div>
          <p className="nexops-business-eyebrow">{props.eyebrow}</p>
          <h1>{props.title}</h1>
          <p>{props.detail}</p>
          {props.status ? <div className="nexops-business-status-row">{props.status}</div> : null}
        </div>
        {props.actions ? <div className="nexops-business-hero-action">{props.actions}</div> : null}
      </header>
      {props.navigation ? <nav className="nexops-business-nav" aria-label={`${props.title} sections`}>{props.navigation}</nav> : null}
      <div className="nexops-business-content">{props.children}</div>
    </section>
  );
}
