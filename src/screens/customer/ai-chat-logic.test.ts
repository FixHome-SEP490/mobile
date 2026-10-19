// The assistant on the phone follows the web's rules (PO 18/10/2026).
import {
  AI_MAX_VIDEOS,
  BOOKING_MAX_VIDEOS,
  bookingMediaIds,
  chatAttachmentSummary,
  nextPinnedService,
  quickReplies,
  revealSteps,
  REVEAL_STEPS,
  videoDuration,
  videoMimeType,
  videoProblem,
} from './ai-chat-logic';

describe('quick replies', () => {
  it('offers Rồi/Chưa for a "chưa" question and Có/Không for a "không" question', () => {
    expect(quickReplies('Anh/chị đã thử rút điện cắm lại chưa?')).toEqual(['Rồi', 'Chưa', 'Không rõ']);
    expect(quickReplies('Máy có kêu to không ?')).toEqual(['Có', 'Không', 'Không rõ']);
  });

  it('offers nothing for an open question, a statement or no question', () => {
    expect(quickReplies('Máy lạnh nhà mình hiệu gì ạ?')).toEqual([]);
    expect(quickReplies('Em xem rồi, không sao đâu.')).toEqual([]);
    expect(quickReplies(undefined)).toEqual([]);
    expect(quickReplies(null)).toEqual([]);
  });
});

describe('writing a reply out', () => {
  it('grows by whole words and ends on the full text', () => {
    const text = 'Dạ khả năng là gioăng bị mòn ạ';
    const steps = revealSteps(text);
    expect(steps[steps.length - 1]).toBe(text);
    expect(steps.every((step) => text.startsWith(step))).toBe(true);
    expect(steps.every((step) => !step.endsWith(' '))).toBe(true);
  });

  it('keeps a long reply to a bounded number of steps and a single word to one', () => {
    const long = Array.from({ length: 400 }, (_, i) => `từ${i}`).join(' ');
    expect(revealSteps(long).length).toBeLessThanOrEqual(REVEAL_STEPS);
    expect(revealSteps('Dạ')).toEqual(['Dạ']);
  });
});

describe('the pinned service', () => {
  const specific = { serviceCode: 'SUA_VOI_NUOC', nameVi: 'Sửa vòi nước' };
  const fallback = { serviceCode: 'DICH_VU_KHAC', nameVi: 'Dịch vụ khác' };
  const other = { serviceCode: 'SUA_MAY_LANH', nameVi: 'Sửa máy lạnh' };

  it('keeps a specific service when the next reply only offers a catch-all', () => {
    expect(nextPinnedService(specific, fallback)).toBe(specific);
  });

  it('takes a new specific service, a first catch-all, and keeps the current one when nothing is offered', () => {
    expect(nextPinnedService(specific, other)).toBe(other);
    expect(nextPinnedService(null, fallback)).toBe(fallback);
    expect(nextPinnedService(specific, undefined)).toBe(specific);
  });
});

describe('videos for the technician', () => {
  it('accepts MP4, MOV and WebM up to 50 MB, two at most', () => {
    expect(videoProblem({ type: 'video/mp4', sizeBytes: 1024 }, 0)).toBeNull();
    expect(videoProblem({ type: 'video/quicktime', sizeBytes: null }, 1)).toBeNull();
    expect(videoProblem({ type: 'video/webm', sizeBytes: 50 * 1024 * 1024 }, 0)).toBeNull();
    expect(videoProblem({ type: 'video/mp4', sizeBytes: 1 }, AI_MAX_VIDEOS)).toBe('Gửi được tối đa 2 video.');
    expect(videoProblem({ type: 'video/x-msvideo', sizeBytes: 1 }, 0)).toBe('Chỉ gửi được video MP4, MOV hoặc WebM.');
    expect(videoProblem({ type: 'video/mp4', sizeBytes: 50 * 1024 * 1024 + 1 }, 0)).toBe('Video lớn hơn 50 MB, vui lòng quay ngắn hơn.');
  });

  it('works out the type when the picker reports none', () => {
    expect(videoMimeType('file:///clip.MOV', null)).toBe('video/quicktime');
    expect(videoMimeType('file:///clip.webm', '')).toBe('video/webm');
    expect(videoMimeType('file:///clip', undefined)).toBe('video/mp4');
    expect(videoMimeType('file:///clip.mov', 'video/x-m4v')).toBe('video/mp4');
    expect(videoMimeType('file:///clip.mp4', 'VIDEO/MP4')).toBe('video/mp4');
  });

  it('shows the length as m:ss and nothing when unknown', () => {
    expect(videoDuration(23_400)).toBe('0:23');
    expect(videoDuration(61_000)).toBe('1:01');
    expect(videoDuration(null)).toBe('');
    expect(videoDuration(0)).toBe('');
    expect(videoDuration(Number.NaN)).toBe('');
  });
});

describe('handing the chat over to the booking', () => {
  const chat = [
    { uploadId: 'chat-photo-1', kind: 'image' as const },
    { uploadId: 'chat-video-1', kind: 'video' as const },
    { uploadId: 'chat-photo-2', kind: 'image' as const },
    { uploadId: 'chat-video-2', kind: 'video' as const },
    { uploadId: 'chat-video-3', kind: 'video' as const },
  ];

  it('puts the booking photos first, then the chat photos while there is room, then two videos', () => {
    expect(bookingMediaIds(['own-1'], chat, 5)).toEqual(['own-1', 'chat-photo-1', 'chat-video-1', 'chat-photo-2', 'chat-video-2']);
    expect(BOOKING_MAX_VIDEOS).toBe(2);
  });

  it('drops chat photos past the five-photo limit but still sends the videos', () => {
    const own = ['own-1', 'own-2', 'own-3', 'own-4'];
    expect(bookingMediaIds(own, chat, 5)).toEqual([...own, 'chat-photo-1', 'chat-video-1', 'chat-video-2']);
  });

  it('never sends an id twice or an empty one', () => {
    expect(bookingMediaIds(['chat-photo-1'], [...chat.slice(0, 1), { uploadId: '', kind: 'image' }], 5)).toEqual(['chat-photo-1']);
    expect(bookingMediaIds([], [], 5)).toEqual([]);
  });

  it('says what goes along in plain words', () => {
    expect(chatAttachmentSummary(chat)).toBe('2 ảnh, 3 video');
    expect(chatAttachmentSummary(chat.filter((c) => c.kind === 'video'))).toBe('3 video');
    expect(chatAttachmentSummary([])).toBe('');
  });
});
