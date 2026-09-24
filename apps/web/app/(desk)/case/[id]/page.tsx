import type { Metadata } from 'next';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Case ${id} · ACHP` };
}

// P1 placeholder: the sheet on the desk that P3 fills with the live investigation.
export default async function CasePage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8 md:py-12">
      <article className="paper px-6 py-8 shadow-lift-sheet md:px-12 md:py-12">
        <h1 className="type-claim text-ink">Case {id}</h1>
        <p className="mt-4 max-w-[68ch] type-body text-ink-2">
          Nothing has been checked on this sheet yet. The live investigation arrives with the event
          protocol.
        </p>
      </article>
    </div>
  );
}
