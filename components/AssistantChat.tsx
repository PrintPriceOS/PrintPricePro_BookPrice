import React, { useState, useRef, useEffect } from 'react';
import {
  AI_ASSISTANT_ENDPOINT,
  PRINTPRICE_ASSISTANT_PROMPT,
  BOOK_PRICE_API_ENDPOINT,
} from '../constants';
import { InitialBookPricePayload, BookPriceResponse, BookPriceOffer } from '../types';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { t } from '../i18n/en';
import { normaliseApiResponse } from '../lib/normaliseApiResponse';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  kind?: 'text' | 'offers';
  offersSnapshot?: BookPriceResponse;
  ui?: {
    show_offers?: boolean;
    recommended_offer_ids?: string[];
  };
}

interface AssistantChatProps {
  specs: InitialBookPricePayload;
  offers: BookPriceResponse | null;
  onSpecsPatch: (patch: Partial<InitialBookPricePayload>) => void;
  onOffersUpdate: (offers: BookPriceResponse) => void;
  onChooseOffer: (offer: BookPriceOffer) => Promise<void>;
  selectedOfferId?: string | null;
}

// Security Layer 2: Challenge Context Helper (v5.2)
async function getPayloadContext(data: any) {
  // Use core fields that define the pricing model to bind the token
  const coreFields = [data.copies, data.interior_pages || 0, data.book_size];
  const msgUint8 = new TextEncoder().encode(JSON.stringify(coreFields));
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Expected from the assistant backend:
 *
 * {
 *   "reply": "text to show the user",
 *   "specs_patch": { ...patched fields for the form... },
 *   "ui": { "show_offers": true },
 *   "order_url": "optional review URL"
 * }
 *
 * Important:
 * Assistant responses must not be treated as pricing authority.
 * Real offers must always be fetched through BOOK_PRICE_API_ENDPOINT.
 */
interface AssistantResponse {
  reply: string;
  specs_patch?: Partial<InitialBookPricePayload> | null;
  order_url?: string;
  ui?: {
    show_offers?: boolean;
    recommended_offer_ids?: string[];
  };
}

const AssistantChat: React.FC<AssistantChatProps> = ({
  specs,
  offers,
  onSpecsPatch,
  onOffersUpdate,
  onChooseOffer,
  selectedOfferId,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello, I'm PrintPrice Pro AI Assistant. I can help you describe your book printing project and get real quotes.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll dentro del área de chat cada vez que cambian los mensajes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, loading]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const payload = {
        system_prompt: PRINTPRICE_ASSISTANT_PROMPT,
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        ui_state: {
          ORIGINAL_SPECS_BEFORE_THIS_MESSAGE: specs,
          offers,
        },
      };

      console.log("ASSISTANT PAYLOAD messages:", payload.messages.slice(-2));
      console.log("ASSISTANT PAYLOAD specs:", payload.ui_state.ORIGINAL_SPECS_BEFORE_THIS_MESSAGE);

      const res = await fetch(AI_ASSISTANT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (!res.ok) {
        if (res.status === 404) {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: "I'm sorry, but the AI Assistant service is currently unavailable. Please use the form below to manually enter your book specifications and calculate prices. The AI Assistant will be available soon!",
            },
          ]);
          setLoading(false);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const rawData: any = await res.json();
      const data: AssistantResponse =
        typeof rawData === 'string'
          ? { reply: rawData }
          : rawData;

      console.log('AI Assistant Raw Response:', data);

      let finalReply = data.reply || '';
      let patch = data.specs_patch;

      // 1) Normalize the patch coming from the backend
      if (patch) {
        if (typeof patch.book_size === 'string') {
          const bs = patch.book_size;
          if (bs.includes('A5')) patch.book_size = 'A5' as any;
          else if (bs.includes('A4')) patch.book_size = 'A4' as any;
          else if (bs.includes('A6')) patch.book_size = 'A6' as any;
          else if (bs.includes('170') && bs.includes('240')) patch.book_size = '170 x 240 mm' as any;
          else if (bs.includes('210') && bs.includes('210')) patch.book_size = '210 x 210 mm' as any;
        }
        if (typeof patch.delivery_country === 'string') {
          patch.delivery_country = patch.delivery_country.toUpperCase().substring(0, 2);
        }
      }

      // 2) HEURISTIC EXTRACTION: Parse the USER'S message (trimmed)
      const heuristicPatch: Partial<InitialBookPricePayload> = {};
      const userLower = trimmed.toLowerCase();

      // Copies: handle English and Spanish variants
      const copiesMatch = userLower.match(/(\d+)\s*(copies|copys|copie|copias|cop)\b/);
      if (copiesMatch) heuristicPatch.copies = Number(copiesMatch[1]);

      // Interior Pages: handle English and Spanish variants
      const pagesMatch = userLower.match(/(\d+)\s*(interior\s*)?(pages?|pp|paginas?|páginas?|pag)\b/);
      if (pagesMatch) heuristicPatch.interior_pages = Number(pagesMatch[1]);

      // Interior Print: B&W interior
      if (/\b(b&w|bw|black\s*&\s*white|black\s*(and|y)\s*white|monochrome|grayscale|bn|b\/n)\b/.test(userLower)) {
        heuristicPatch.interior_print = '1/1';
      }
      // Interior Print: Full color
      if (/\b(interior\s*(in\s*)?color|interior\s*full\s*color|4\/4\s*interior)\b/.test(userLower)) {
        heuristicPatch.interior_print = '4/4';
      }

      // Cover Print: Color cover
      const colorCoverMatch = /\b(cover\s*(in\s*)?color|colour\s*cover|color\s*cover|cubierta\s*(a\s*)?color)\b/.test(userLower);
      if (colorCoverMatch) {
        // Detect if they want both sides
        const bothSides = /\b(both\s*sides|2\s*caras|dos\s*caras|4\/4)\b/.test(userLower);
        heuristicPatch.cover_print = bothSides ? '4/4' : '4/0';
      }

      // Binding
      if (userLower.includes('hardcover') || userLower.includes('hard cover') || userLower.includes('dura')) {
        heuristicPatch.binding_method = 'thread_sewn_hc';
      }
      if (userLower.includes('softcover') || userLower.includes('soft cover') || userLower.includes('blanda') || userLower.includes('perfect')) {
        heuristicPatch.binding_method = 'perfect_bound';
      }

      // Size
      if (userLower.includes('a5')) heuristicPatch.book_size = 'A5' as any;
      if (userLower.includes('a4')) heuristicPatch.book_size = 'A4' as any;
      if (userLower.includes('a6')) heuristicPatch.book_size = 'A6' as any;
      if (userLower.includes('170') && userLower.includes('240')) heuristicPatch.book_size = '170 x 240 mm' as any;

      // Orientation
      if (userLower.includes('landscape') || userLower.includes('horizontal')) heuristicPatch.orientation = 'landscape';
      if (userLower.includes('portrait') || userLower.includes('vertical')) heuristicPatch.orientation = 'portrait';

      // Delivery
      if (userLower.includes('germany') || userLower.includes('alemania')) heuristicPatch.delivery_country = 'DE';
      if (userLower.includes('spain') || userLower.includes('españa')) heuristicPatch.delivery_country = 'ES';
      if (userLower.includes('uk') || userLower.includes('united kingdom') || userLower.includes('reino unido') || userLower.includes('england')) heuristicPatch.delivery_country = 'GB';

      // GSM Detection (Interior, Cover, Endpapers)
      // Interior GSM: "120 gsm interior" or "interior 120gsm"
      const interiorGsmMatch = userLower.match(/(?:interior|pages?).*?(\d{2,3})\s*gsm|(\d{2,3})\s*gsm.*?(?:interior|pages?)/);
      if (interiorGsmMatch) {
        const gsm = Number(interiorGsmMatch[1] || interiorGsmMatch[2]);
        heuristicPatch.paper_weight_interior = gsm;
      }

      // Cover GSM: "250 gsm cover" or "cover 250gsm"
      const coverGsmMatch = userLower.match(/(?:cover|cubierta).*?(\d{2,3})\s*gsm|(\d{2,3})\s*gsm.*?(?:cover|cubierta)/);
      if (coverGsmMatch) {
        const gsm = Number(coverGsmMatch[1] || coverGsmMatch[2]);
        heuristicPatch.paper_weight_cover = gsm;
      }

      // Endpapers GSM: "endpapers 150gsm" or "150 gsm endpapers"
      const endpapersGsmMatch = userLower.match(/(?:endpapers?|guardas?).*?(\d{2,3})\s*gsm|(\d{2,3})\s*gsm.*?(?:endpapers?|guardas?)/);
      if (endpapersGsmMatch) {
        const gsm = Number(endpapersGsmMatch[1] || endpapersGsmMatch[2]);
        heuristicPatch.paper_weight_endpapers = gsm;
      }

      // Endpapers presence
      if (/\b(endpapers?|guardas?)\b/.test(userLower)) {
        heuristicPatch.endpapers = 'standard';

        // Endpapers print: "endpapers 1/1" or "endpapers b&w"
        if (/endpapers?.*?(1\/1|b&w|bw|black\s*&\s*white)/i.test(userLower)) {
          heuristicPatch.endpapers_print = '1/1';
        } else if (/endpapers?.*?(4\/4|color|colour)/i.test(userLower)) {
          heuristicPatch.endpapers_print = '4/4';
        }
      }

      // Paper Types
      if (/\b(offset|woodfree|mc)\b/.test(userLower)) {
        // Check context to determine if it's for interior, cover, or endpapers
        if (/(?:interior|pages?).*?(?:offset|woodfree|mc)|(?:offset|woodfree|mc).*?(?:interior|pages?)/i.test(userLower)) {
          heuristicPatch.paper_type_interior = 'offset';
        }
        if (/(?:endpapers?|guardas?).*?(?:offset|woodfree|mc)|(?:offset|woodfree|mc).*?(?:endpapers?|guardas?)/i.test(userLower)) {
          heuristicPatch.paper_type_endpaper = 'offset';
        }
      }
      if (/\b(artboard|estucado)\b/.test(userLower)) {
        heuristicPatch.paper_type_cover = 'artboard';
      }

      console.log('Backend Patch:', patch);
      console.log('Heuristic Patch:', heuristicPatch);

      // 3) MERGE & OVERRIDE: Heuristic overrides patch if conflict detected for critical fields
      let finalPatch: Partial<InitialBookPricePayload> = { ...(patch ?? {}) };

      // Conflict guards: if user clearly stated intent, heuristic wins over backend patch
      if (heuristicPatch.copies !== undefined) finalPatch.copies = heuristicPatch.copies;
      if (heuristicPatch.interior_pages !== undefined) finalPatch.interior_pages = heuristicPatch.interior_pages;
      if (heuristicPatch.binding_method !== undefined) finalPatch.binding_method = heuristicPatch.binding_method;
      if (heuristicPatch.book_size !== undefined) finalPatch.book_size = heuristicPatch.book_size;
      if (heuristicPatch.orientation !== undefined) finalPatch.orientation = heuristicPatch.orientation;
      if (heuristicPatch.delivery_country !== undefined) finalPatch.delivery_country = heuristicPatch.delivery_country;
      if (heuristicPatch.interior_print !== undefined) finalPatch.interior_print = heuristicPatch.interior_print;
      if (heuristicPatch.cover_print !== undefined) finalPatch.cover_print = heuristicPatch.cover_print;

      // GSM overrides
      if (heuristicPatch.paper_weight_interior !== undefined) finalPatch.paper_weight_interior = heuristicPatch.paper_weight_interior;
      if (heuristicPatch.paper_weight_cover !== undefined) finalPatch.paper_weight_cover = heuristicPatch.paper_weight_cover;
      if (heuristicPatch.paper_weight_endpapers !== undefined) finalPatch.paper_weight_endpapers = heuristicPatch.paper_weight_endpapers;

      // Paper types
      if (heuristicPatch.paper_type_interior !== undefined) finalPatch.paper_type_interior = heuristicPatch.paper_type_interior;
      if (heuristicPatch.paper_type_cover !== undefined) finalPatch.paper_type_cover = heuristicPatch.paper_type_cover;
      if (heuristicPatch.paper_type_endpaper !== undefined) finalPatch.paper_type_endpaper = heuristicPatch.paper_type_endpaper;

      // Endpapers
      if (heuristicPatch.endpapers !== undefined) finalPatch.endpapers = heuristicPatch.endpapers;
      if (heuristicPatch.endpapers_print !== undefined) finalPatch.endpapers_print = heuristicPatch.endpapers_print;

      // Binding/endpaper invariant:
      // Perfect Bound is softcover and must not carry standard endpapers.
      const effectiveBinding = finalPatch.binding_method ?? specs.binding_method;
      if (effectiveBinding === 'perfect_bound') {
        finalPatch.endpapers = 'none';
        finalPatch.endpapers_print = 'none';
      }

      console.log('Final merged patch to apply:', finalPatch);
      const appliedSpecs = { ...specs, ...finalPatch };

      // 4) REPAIR HALLUCINATIONS in the reply text
      // If the reply contains a Project Summary, we replace it with the ACTUAL data we are applying.
      const summaryRegex = /Project Summary:[\s\S]*?(?=\n\n|\n[A-Z]|$)/i;

      if (summaryRegex.test(finalReply)) {
        const getBindingLabel = (m: string) => {
          if (m === 'thread_sewn_hc') return 'Hardcover';
          if (m === 'perfect_bound') return 'Softcover';
          return m;
        };
        const getPrintLabel = (p: string) => {
          if (p === '4/4') return 'Full Color (2 sides)';
          if (p === '4/0') return 'Full Color (1 side)';
          if (p === '1/1') return 'Black & White';
          if (p === '1/0') return 'B&W (1 side)';
          return p;
        };

        const truthSummary = `Project Summary:
• Copies: ${appliedSpecs.copies}
• Size: ${appliedSpecs.book_size} (${appliedSpecs.orientation})
• Interior Pages: ${appliedSpecs.interior_pages}
• Binding: ${getBindingLabel(appliedSpecs.binding_method)}
• Interior Print: ${getPrintLabel(appliedSpecs.interior_print)}
• Cover Print: ${getPrintLabel(appliedSpecs.cover_print)}
• Delivery: ${appliedSpecs.delivery_country}`;

        // Find and replace the summary block
        finalReply = finalReply.replace(summaryRegex, truthSummary);

        // Remove the "no offers" message if we are about to heal them
        if (appliedSpecs.interior_pages > 0) {
          finalReply = finalReply.replace(/It has not been possible to get offers at this time\./gi, '');
        }
      }

      // Add text message
      if (finalReply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: finalReply.trim(),
            kind: 'text',
          },
        ]);
      }

      // 5) APPLY PATCH to form
      if (Object.keys(finalPatch).length > 0) {
        onSpecsPatch(finalPatch);
      }

      // 6) OFFERS AUTO-HEALING (Hardened v5.2)
      // Only fetch offers if pages are valid AND user asked or UI requested them
      const userAskedForOffers = /\b(price|prices|quote|quotes|offer|offers|cost|calculate|precio|oferta|coste|calcular)\b/i.test(trimmed);
      const validPages = Number(appliedSpecs.interior_pages) > 0;
      const shouldFetchOffers = validPages && (data.ui?.show_offers === true || userAskedForOffers);

      let healedOffers: BookPriceResponse | null = null;

      if (shouldFetchOffers) {
        console.log('Performing auto-healing handshake with secure budget path...');
        try {
          // 1. Obtain Bound Server Challenge
          const payloadCtx = await getPayloadContext(appliedSpecs);
          const challengeRes = await fetch('/api/security/challenge', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload_context: payloadCtx })
          });
          if (!challengeRes.ok) throw new Error('Infrastructure safeguard triggered.');
          const { token, nonce, timestamp } = await challengeRes.json();

          // 2. Request Final Calculation with token
          const bpeRes = await fetch(BOOK_PRICE_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...appliedSpecs,
              security_token: token,
              nonce,
              timestamp
            }),
          });
          if (bpeRes.ok) {
            const bpeData = await bpeRes.json();
            const normalised = normaliseApiResponse(bpeData);
            
            if (normalised.offers.length > 0) {
              healedOffers = normalised;
              onOffersUpdate(normalised);
              console.log('Offers successfully healed via shared normalizer:', healedOffers);
            }
          }
        } catch (e) {
          console.error('Failed to heal offers safely:', e);
        }
      } else if (offers?.offers?.length) {
        // Use existing offers if pages are valid but no new fetch was triggered
        healedOffers = offers;
      }

      // 7) SHOW OFFERS if UI requested or we have them
      const shouldShowOffers =
        data.ui?.show_offers === true || !!healedOffers?.offers?.length;

      if (shouldShowOffers) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-offers-${Date.now()}`,
            role: 'assistant',
            content: '',
            kind: 'offers',
            offersSnapshot: healedOffers ?? undefined,
            ui: {
              show_offers: true,
              recommended_offer_ids: data.ui?.recommended_offer_ids || [],
            },
          },
        ]);
      }

      // Order created
      if (data.order_url) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-order-${Date.now()}`,
            role: 'assistant',
            content: `Order request created. Payment remains pending. You can review it here: ${data.order_url}`,
          },
        ]);
      }
    } catch (err: any) {
      console.error('Assistant error:', err);
      // Don't show technical error to user if it's a 404 (already handled above)
      if (!err.message?.includes('404')) {
        setError(err?.message || 'Error contacting the assistant.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-4 sm:mb-8 min-w-0">
      <div className="bg-corporate-secondary rounded-2xl shadow-sm border border-corporate-border flex flex-col h-[310px] sm:h-[430px] overflow-hidden transition-all duration-300 relative min-w-0">
        <div className="absolute top-0 right-0 opacity-[0.03] font-technical text-[4rem] sm:text-[6rem] font-black pointer-events-none uppercase select-none leading-none">
          AI_BPE
        </div>
        <div className="bg-corporate-elevated/70 px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-3 border-b border-corporate-border relative z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-corporate-accent shrink-0" />
              <h2 className="text-xs font-sans font-black tracking-wider sm:tracking-monolith text-corporate-text uppercase truncate">
                PrintPrice OS · AI Specification Assistant
              </h2>
            </div>
            <p className="text-[10px] text-corporate-muted font-technical uppercase tracking-wider mt-1 truncate">
              Natural Language Spec Extraction · Authoritative BPE Pricing Bridge
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-corporate-accent/10 px-3 py-1 rounded-full border border-corporate-accent/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-corporate-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-corporate-accent"></span>
              </span>
              <span className="text-[9px] font-technical font-black uppercase tracking-wider text-corporate-accent">
                Online
              </span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-5 px-3.5 sm:px-8 py-3 sm:py-6 scroll-smooth bg-corporate-primary/40 min-w-0">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} min-w-0`}
            >
              <div
                className={`max-w-[92%] sm:max-w-[80%] min-w-0 transition-all duration-300 ${
                  m.role === 'user'
                    ? 'p-3.5 sm:p-5 rounded-xl bg-corporate-accent text-white border-l-4 border-corporate-border-strong shadow-sm'
                    : m.kind === 'offers'
                      ? 'text-corporate-text w-full min-w-0'
                      : 'p-3.5 sm:p-5 rounded-xl bg-corporate-secondary text-corporate-text border border-corporate-border shadow-sm'
                }`}
              >
                {m.content.includes('Project Summary') ? (
                  <div className="space-y-4">
                    <p className="text-xs font-sans font-black text-corporate-accent uppercase tracking-wider sm:tracking-monolith border-b border-corporate-border pb-3 mb-3">
                      {t('project_summary_title') || 'Project Summary'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
                      {m.content.split('\n').filter(line => line.includes(':')).map((line, idx) => {
                        const [label, value] = line.replace(/^[•\-\*]\s*/, '').split(':');
                        return (
                          <div key={idx} className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-corporate-muted uppercase text-[9px] font-technical font-bold tracking-wider">{label.trim()}</span>
                            <span className="font-technical text-corporate-text font-bold uppercase text-[11px] tracking-wider break-words">{value?.trim()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : m.kind === 'offers' ? (
                  <div className="space-y-4 min-w-0">
                    <p className="text-[10px] font-sans font-black text-corporate-accent uppercase tracking-wider sm:tracking-monolith border-b border-corporate-border pb-3">
                      {t('recommended_offers') || 'Recommended Offers'}
                    </p>
                    <div className="space-y-3">
                      {(() => {
                        const displayOffers = m.offersSnapshot ?? offers;
                        if (!displayOffers?.offers?.length) {
                          return (
                            <div className="text-[10px] font-technical text-corporate-muted uppercase tracking-widest italic py-4">
                              Calculating BPE offers...
                            </div>
                          );
                        }

                        const recommended = displayOffers.offers.find(o => o.recommended);
                        const sortedOffers = [...displayOffers.offers].sort((a, b) => {
                          const getP = (o: any) => Number(o.total_price ?? o.total_cost ?? Number.MAX_SAFE_INTEGER);
                          return getP(a) - getP(b);
                        });

                        const topThree = sortedOffers.slice(0, 3);
                        const visibleOffers =
                          recommended && !topThree.some(o => o.id === recommended.id)
                            ? [...topThree, recommended]
                            : topThree;

                        return visibleOffers.map((offer, index) => {
                          const isBestPrice = index === 0;
                          const isSelected = selectedOfferId === offer.id;
                          const isRecommended = offer.recommended;
                          const displayPrice = Number(offer.total_price ?? offer.total_cost ?? 0);
                          const hasFiniteDisplayPrice = Number.isFinite(displayPrice) && displayPrice > 0;

                          return (
                            <div
                              key={offer.id}
                              className={`border rounded-xl p-4 sm:p-5 flex flex-col gap-3 transition-all duration-200 relative group overflow-hidden ${
                                isSelected ? 'border-corporate-accent bg-corporate-secondary' : 'border-corporate-border bg-corporate-secondary/80'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 relative z-10">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <p className="text-xs font-sans font-black text-corporate-text uppercase tracking-wider">
                                      {offer.print_house}
                                    </p>
                                    {isRecommended && (
                                      <span className="bg-corporate-accent/10 text-corporate-accent text-[8px] font-technical font-black px-2 py-0.5 rounded-full border border-corporate-accent/30">
                                        RECOMMENDED BY BPE
                                      </span>
                                    )}
                                  </div>
                                  {offer.estimated_delivery_time && (
                                    <p className="text-[10px] font-technical text-corporate-muted uppercase tracking-wider">
                                      ETA: {offer.estimated_delivery_time}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-4">
                                  <div className="text-left sm:text-right">
                                    {offer.range ? (
                                      <p className="text-lg font-display font-black text-corporate-text tabular-nums">
                                        {offer.range}
                                      </p>
                                    ) : hasFiniteDisplayPrice ? (
                                      <p className="text-xl font-display font-black text-corporate-text tabular-nums">
                                        {displayPrice.toFixed(2)} <span className="text-corporate-accent text-xs">{offer.currency}</span>
                                      </p>
                                    ) : (
                                      <p className="text-sm font-technical font-black text-corporate-muted uppercase">
                                        Unavailable
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (offer.checkout_allowed === false) return;
                                      if (m.offersSnapshot) onOffersUpdate(m.offersSnapshot);
                                      onChooseOffer(offer);
                                    }}
                                    disabled={isSelected || offer.checkout_allowed === false}
                                    className={`inline-flex items-center px-4 py-2 rounded-xl min-h-[38px] text-[10px] font-technical font-black tracking-wider uppercase transition-all shrink-0
                                      ${isSelected
                                        ? 'bg-corporate-accent/15 border border-corporate-accent text-corporate-accent cursor-default'
                                        : offer.checkout_allowed === false
                                          ? 'bg-corporate-elevated border border-corporate-border text-corporate-muted cursor-not-allowed'
                                          : 'bg-corporate-accent text-white hover:bg-corporate-hover'
                                      }`}
                                  >
                                    {isSelected
                                      ? '✓ Selected'
                                      : offer.checkout_allowed === false
                                        ? 'Quote Required'
                                        : 'Select →'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="font-sans text-xs sm:text-[13px] leading-relaxed whitespace-pre-line break-words">{m.content}</div>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="bg-corporate-accent/10 rounded-xl border border-corporate-accent/30 p-4">
              <p className="text-[10px] font-technical font-black text-corporate-accent uppercase tracking-wider">Assistant Notice</p>
              <p className="text-xs text-corporate-text-secondary mt-1">{error}</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3.5 sm:px-8 py-2.5 sm:py-3.5 bg-corporate-secondary border-t border-corporate-border flex items-center gap-2.5 sm:gap-4 relative z-10">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Describe your book project (e.g., 1000 copies, A5, 160 pages, hardcover)..."
            className="flex-1 min-w-0 rounded-xl bg-corporate-elevated border border-corporate-border px-3.5 py-2.5 text-xs sm:text-sm text-corporate-text placeholder:text-corporate-muted font-sans focus:border-corporate-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            aria-label="Send message to AI Assistant"
            className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center bg-corporate-accent text-white hover:bg-corporate-hover transition-all duration-200 disabled:opacity-40 group shadow-sm"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-b-transparent animate-spin" />
            ) : (
              <PaperAirplaneIcon className="h-4 w-4 transform -rotate-45 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
};

export default AssistantChat;
