import { SPOT_KEEP_DAYS } from '../core/spots';
import type { Lang } from './strings';

export type KeepPage = { title: string; intro: string; sections: { h: string; p: string }[] };

export const KEEP: Record<Lang, KeepPage> = {
  th: {
    title: 'ข้อมูลที่เราเก็บ',
    intro: 'เมื่อคุณถึงประตูหรือเลือกฮอลล์ที่อยู่ ตัวช่วยหาบูธอาจถามว่า "ช่วยให้แผนที่ตรงขึ้นไหม" หน้านี้บอกว่าจะเกิดอะไรขึ้นถ้าคุณแตะ "ส่งจุดนี้"',
    sections: [
      {
        h: 'สิ่งที่เราได้รับ',
        p: 'ชื่องาน ทางเข้าหรือฮอลล์ที่คุณอยู่ ค่า GPS หนึ่งครั้งจากโทรศัพท์ของคุณ (ละติจูด ลองจิจูด และความแม่นยำที่โทรศัพท์รายงาน) และชั่วโมงที่ส่ง',
      },
      {
        h: 'สิ่งที่เราไม่เก็บ',
        p: 'ไม่มีชื่อ อีเมล เบอร์โทร รหัสเครื่อง หมายเลข IP หรือข้อมูลเบราว์เซอร์ ไม่มีอะไรบอกได้ว่าจุดสองจุดมาจากคนเดียวกัน ระหว่างที่ใช้ "ใช้ตำแหน่งของฉัน" ตำแหน่งของคุณอยู่ในโทรศัพท์เท่านั้น มีเพียงค่าเดียวที่คุณเลือกส่งที่ออกจากเครื่อง',
      },
      {
        h: 'ทำไมเราถึงถาม',
        p: 'ค่าจากผู้มางานหลายคนที่ประตูเดียวกันบอกได้ว่าประตูนั้นอยู่ตรงไหนบนแผนที่ถนนจริง ๆ เราจึงวางผังงานให้ตรงขึ้นสำหรับผู้มาคนถัดไปได้ ค่าจากในฮอลล์ใช้ตรวจแผนที่เท่านั้น',
      },
      {
        h: 'ใครเห็นข้อมูลนี้',
        p: 'เฉพาะเจ้าของเว็บ ในหน้าตรวจที่ต้องใช้พาสคีย์เข้า เราดูค่าต่าง ๆ รวมกัน ไม่ดูค่าของใครคนเดียว ถ้าเราย้ายหมุดแผนที่ จะมีเพียงจุดกึ่งกลางของค่าหลายค่าที่เข้าไปอยู่ในเว็บ',
      },
      { h: 'เราเก็บนานแค่ไหน', p: `เราลบแต่ละค่าเมื่อครบ ${SPOT_KEEP_DAYS} วันหลังวันสุดท้ายของงาน` },
      { h: 'เก็บไว้ที่ไหน', p: 'ในฐานข้อมูลของ Cloudflare ซึ่งให้บริการเว็บนี้และรับทุกคำขอที่ส่งมาที่เว็บ' },
      {
        h: 'ถ้าไม่อยากส่ง',
        p: 'แตะ "ไม่เป็นไร" ถ้าติ๊ก "ไม่ต้องถามอีกในงานนี้" ด้วย เราจะไม่ถามอีกในงานนี้ โทรศัพท์ของคุณจำแค่ตัวเลือกนี้ ไม่ได้จำตำแหน่งของคุณ',
      },
    ],
  },
  en: {
    title: 'What we keep',
    intro:
      'When you reach a door or pick your hall, the booth finder may ask "Help line up the map?". This page says what happens if you tap "Send this spot".',
    sections: [
      {
        h: 'What we receive',
        p: 'The event, the entrance or hall you are at, one GPS reading from your phone (latitude, longitude and how accurate your phone says it is) and the hour it was sent.',
      },
      {
        h: "What we don't keep",
        p: 'No name, email, phone number, phone ID, IP address or browser details. Nothing links two spots to the same person. While you use "Use my location", your position stays on your phone. Only the one reading you choose to send leaves it.',
      },
      {
        h: 'Why we ask',
        p: 'Readings from many guests at the same door show where that door really is on the street map, so we can line up the floor plan for the next guests. Hall readings only help us check the map.',
      },
      {
        h: 'Who sees it',
        p: 'Only the site owner, on a review screen that needs a passkey. We look at readings together, never one guest on their own. If we move a map pin, only the middle of many readings goes into the site.',
      },
      { h: 'How long we keep it', p: `We delete each reading ${SPOT_KEEP_DAYS} days after the event's last day.` },
      {
        h: 'Where it is stored',
        p: 'In a Cloudflare database. Cloudflare hosts this site and handles every request to it.',
      },
      {
        h: 'Saying no',
        p: 'Tap "No thanks". Tick "Don\'t ask again at this event" too and we won\'t ask again at this event. Your phone remembers only that choice, not your location.',
      },
    ],
  },
};
