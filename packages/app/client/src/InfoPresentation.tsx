import { Button } from '@databricks/appkit-ui/react';
import { useState, type KeyboardEvent } from 'react';

const slides = [
  {
    title: 'A daily lottery receipt audit',
    content: (
      <div className="info-slide-split">
        <p className="info-slide-lead">
          A customer needed to audit lottery receipts before the daily state submission.
        </p>
        <div className="info-slide-emphasis" aria-label="Daily state submission">
          <strong>Daily</strong>
          <span>state submission</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Manual review introduced errors',
    content: (
      <div className="info-slide-split">
        <p className="info-slide-lead">
          Staff had to find missing fields and correct data entry before the daily deadline.
        </p>
        <div className="info-error-list">
          <span>Missing receipt fields</span>
          <span>Manual entry errors</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Other document checks',
    content: (
      <div className="info-question-list">
        <p>Could the same method verify an ID card?</p>
        <p>Could it confirm that a signed document was complete?</p>
      </div>
    ),
  },
  {
    title: 'AI generates the data workflow',
    content: (
      <div className="info-capability-contrast">
        <div>
          <span>Process</span>
          <p>Extract each image into a structured record.</p>
        </div>
        <div>
          <span>Generate</span>
          <p>Create the schema, dashboard, and ingestion pipeline that organize those records.</p>
        </div>
      </div>
    ),
  },
  {
    title: 'Generated data flow',
    content: (
      <ol className="info-flow" aria-label="Generated data flow">
        <li>
          <span>1</span>
          <div>
            <strong>Prompt</strong>
            <small>Describe the fields and checks</small>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Generate schema</strong>
            <small>Define the fields and validation rules</small>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Generate dashboard</strong>
            <small>Display data from the schema</small>
          </div>
        </li>
        <li>
          <span>4</span>
          <div>
            <strong>Create ingestion pipeline</strong>
            <small>Process incoming images for each schema</small>
          </div>
        </li>
      </ol>
    ),
  },
] as const;

export function InfoPresentation() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = slides[activeSlide];

  const showSlide = (index: number) => {
    setActiveSlide(Math.min(Math.max(index, 0), slides.length - 1));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showSlide(activeSlide - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      showSlide(activeSlide + 1);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      showSlide(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      showSlide(slides.length - 1);
    }
  };

  return (
    <section
      className="info-deck"
      aria-label="Vision Flow story"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="info-deck-progress">
        <span>
          {activeSlide + 1} / {slides.length}
        </span>
        <div className="info-deck-dots" aria-label="Choose a slide">
          {slides.map((item, index) => (
            <button
              key={item.title}
              type="button"
              className={index === activeSlide ? 'active' : ''}
              aria-label={`Go to slide ${index + 1}: ${item.title}`}
              aria-current={index === activeSlide ? 'step' : undefined}
              onClick={() => showSlide(index)}
            />
          ))}
        </div>
      </div>

      <article className="info-slide" aria-live="polite" aria-label={`Slide ${activeSlide + 1} of ${slides.length}`}>
        <div className="info-slide-content">
          <h2>{slide.title}</h2>
          {slide.content}
        </div>
      </article>

      <div className="info-deck-controls">
        <Button variant="outline" onClick={() => showSlide(activeSlide - 1)} disabled={activeSlide === 0}>
          Previous
        </Button>
        <Button onClick={() => showSlide(activeSlide + 1)} disabled={activeSlide === slides.length - 1}>
          Next
        </Button>
      </div>
    </section>
  );
}
