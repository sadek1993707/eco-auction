import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { blink } from '@/blink/client'
import { BlinkClientBoundary } from '@/components/BlinkClientBoundary'
import type { AuctionBidsRow, AuctionCarsRow } from '@/lib/db-types'
import { toast } from 'sonner'
import {
  ArrowDownUp, ArrowLeft, ArrowUpLeft, BadgeCheck, CarFront, Check,
  ChevronDown, Clock3, Fuel, Gauge, Gavel, MapPin, Menu, Plus,
  Search, ShieldCheck, SlidersHorizontal, X,
} from 'lucide-react'

const ownerId = 'cqdRQ5ALQJO1FINUGRRkJuz55uZ2'
const carsTable = blink.db.table<AuctionCarsRow>('auction_cars')
const bidsTable = blink.db.table<AuctionBidsRow>('auction_bids')

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'معرض ايكو للسيارات | مزاد السيارات في ليبيا' },
      { name: 'description', content: 'تصفح السيارات وشارك في مزاد ايكو للسيارات في ليبيا.' },
    ],
  }),
  component: Home,
})

function Home() {
  return <BlinkClientBoundary fallback={<Loading />}><Auction /></BlinkClientBoundary>
}

function Loading() {
  return <div className="flex min-h-screen items-center justify-center bg-[#101512] text-lime-300"><CarFront className="h-8 w-8 animate-pulse" /></div>
}

function Auction() {
  const [user, setUser] = useState<NonNullable<Awaited<ReturnType<typeof blink.auth.me>>> | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cars, setCars] = useState<AuctionCarsRow[]>([])
  const [bids, setBids] = useState<AuctionBidsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('الكل')
  const [sortOrder, setSortOrder] = useState('newest')
  const [selected, setSelected] = useState<AuctionCarsRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const isAdmin = user?.id === ownerId

  const loadData = useCallback(async () => {
    try {
      const [carRows, bidRows] = await Promise.all([
        carsTable.list({ orderBy: { createdAt: 'desc' } }),
        bidsTable.list({ orderBy: { createdAt: 'desc' } }),
      ])
      setCars(carRows)
      setBids(bidRows)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل المزادات حالياً')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    let updateTimer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      updateTimer = setTimeout(() => {
        if (!active) return
        setUser(state.user)
        if (!state.isLoading) setAuthLoading(false)
      }, 0)
    })
    const dataTimer = setTimeout(() => { void loadData() }, 0)
    const refreshTimer = setInterval(() => { void loadData() }, 15000)
    return () => {
      active = false
      if (updateTimer) clearTimeout(updateTimer)
      clearTimeout(dataTimer)
      clearInterval(refreshTimer)
      unsubscribe()
    }
  }, [loadData])

  const visibleCars = useMemo(() => {
    const filtered = cars.filter((car) => {
      const text = `${car.title} ${car.make} ${car.model} ${car.location}`.toLowerCase()
      const matchesSearch = text.includes(search.trim().toLowerCase())
      const matchesCategory = category === 'الكل' || (category === 'SUV' ? /suv|patrol|tucson/i.test(`${car.model} ${car.title}`) : category === 'سيدان' ? /camry|c200|sedan/i.test(`${car.model} ${car.title}`) : /pickup|hilux|truck/i.test(`${car.model} ${car.title}`))
      return matchesSearch && matchesCategory
    })
    return filtered.sort((a, b) => sortOrder === 'price' ? Number(b.startingBid) - Number(a.startingBid) : sortOrder === 'ending' ? new Date(a.auctionEndsAt).getTime() - new Date(b.auctionEndsAt).getTime() : b.createdAt.localeCompare(a.createdAt))
  }, [cars, search, category, sortOrder])

  const priceFor = (car: AuctionCarsRow) => Math.max(Number(car.startingBid), ...bids.filter((bid) => bid.carId === car.id).map((bid) => Number(bid.amount)))
  const bidCountFor = (car: AuctionCarsRow) => bids.filter((bid) => bid.carId === car.id).length

  function signIn() {
    blink.auth.login(window.location.href)
  }

  async function placeBid(car: AuctionCarsRow, amount: number) {
    if (!user) { signIn(); return }
    const current = priceFor(car)
    if (!Number.isFinite(amount) || amount < current + 500) {
      toast.error(`المزايدة التالية تبدأ من ${formatMoney(current + 500)} د.ل`)
      return
    }
    try {
      await bidsTable.create({ userId: user.id, carId: car.id, bidderName: user.displayName || user.email || 'مزايد', amount })
      await loadData()
      toast.success('تم تسجيل مزايدتك بنجاح')
      setSelected(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل المزايدة')
    }
  }

  async function addCar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !isAdmin) return
    const form = new FormData(event.currentTarget)
    try {
      await carsTable.create({
        userId: user.id,
        title: String(form.get('title')),
        make: String(form.get('make')),
        model: String(form.get('model')),
        year: Number(form.get('year')),
        mileage: Number(form.get('mileage')),
        transmission: String(form.get('transmission')),
        fuel: String(form.get('fuel')),
        condition: String(form.get('condition')),
        location: String(form.get('location')),
        imageUrl: String(form.get('imageUrl')),
        startingBid: Number(form.get('startingBid')),
        auctionEndsAt: new Date(Date.now() + Number(form.get('days')) * 86400000).toISOString(),
        description: String(form.get('description')),
      })
      await loadData()
      setShowAdd(false)
      toast.success('تم نشر السيارة في المزاد')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر نشر السيارة')
    }
  }

  async function removeCar(car: AuctionCarsRow) {
    if (!isAdmin) return
    try {
      await carsTable.delete(car.id)
      await loadData()
      setSelected(null)
      toast.success('تم حذف السيارة من المزاد')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حذف السيارة')
    }
  }

  return (
    <div dir="rtl" className="dark min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-foreground/10 bg-[#121814]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-4 sm:px-8">
          <a href="#home" className="flex items-center gap-3" aria-label="ايكو - الصفحة الرئيسية">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground"><CarFront size={24} strokeWidth={2.4} /></span>
            <span><span className="block text-base font-extrabold tracking-tight">ايكو <span className="text-primary">للسيارات</span></span><span className="text-[10px] font-semibold tracking-[.23em] text-muted-foreground">ECO MOTORS · LIBYA</span></span>
          </a>
          <nav className={`${mobileMenu ? 'absolute inset-x-0 top-[76px] flex flex-col border-b border-foreground/10 bg-[#121814] p-5' : 'hidden'} gap-6 text-sm font-medium text-muted-foreground md:static md:flex md:flex-row md:border-0 md:bg-transparent md:p-0`} aria-label="التنقل الرئيسي">
            <a className="transition hover:text-primary" href="#auctions">المزادات</a><a className="transition hover:text-primary" href="#how">كيف تزايد؟</a><a className="transition hover:text-primary" href="#contact">تواصل معنا</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {isAdmin && <button onClick={() => setShowAdd(true)} className="hidden items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 sm:flex"><Plus size={17} /> أضف سيارة</button>}
            {user ? <button onClick={() => blink.auth.logout()} className="hidden rounded-xl border border-foreground/15 px-4 py-2.5 text-sm font-semibold transition hover:border-primary/60 sm:block">خروج</button> : <button onClick={signIn} disabled={authLoading} className="rounded-xl border border-foreground/15 px-3 py-2.5 text-sm font-semibold transition hover:border-primary/60 sm:px-4">دخول / تسجيل</button>}
            <button onClick={() => setMobileMenu(!mobileMenu)} className="grid h-10 w-10 place-items-center rounded-xl border border-foreground/10 md:hidden" aria-label="القائمة"><Menu size={19} /></button>
          </div>
        </div>
      </header>

      <main id="home">
        <section className="relative isolate overflow-hidden border-b border-foreground/5 bg-[#141b16]">
          <div className="absolute inset-0 -z-20 bg-[url('https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=2200&q=90')] bg-cover bg-center" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-l from-[#111813] via-[#111813]/90 to-[#111813]/25" />
          <div className="mx-auto grid min-h-[560px] max-w-[1440px] items-center gap-10 px-5 py-16 sm:px-10 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
            <div className="max-w-2xl animate-fade-in">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> مزادات سيارات موثوقة في ليبيا</div>
              <h1 className="max-w-xl text-4xl font-black leading-[1.2] tracking-tight text-[#f6f7f1] sm:text-5xl lg:text-[60px]">سيارتك القادمة،<br /><span className="text-primary">بسعرك أنت.</span></h1>
              <p className="mt-6 max-w-lg text-base leading-8 text-foreground/65 sm:text-lg">اكتشف سيارات مختارة من مختلف مدن ليبيا، وشارك في مزاد واضح وسهل من أول نقرة حتى ترسي عليك.</p>
              <div className="mt-9 flex flex-wrap gap-3"><a href="#auctions" className="group inline-flex items-center gap-3 rounded-xl bg-primary px-6 py-3.5 font-extrabold text-primary-foreground shadow-lg shadow-primary/15 transition hover:brightness-110 active:scale-[.98]">تصفح المزادات <ArrowLeft size={18} className="transition group-hover:-translate-x-1" /></a><a href="#how" className="rounded-xl border border-foreground/20 px-6 py-3.5 font-bold text-foreground transition hover:border-foreground/50">كيف يعمل المزاد؟</a></div>
              <div className="mt-12 flex flex-wrap gap-x-9 gap-y-4 border-t border-foreground/10 pt-7">
                <div><strong className="block text-2xl font-black text-foreground">{cars.length.toLocaleString('ar-LY')}</strong><span className="text-xs text-foreground/50">سيارة في المزاد</span></div><div><strong className="block text-2xl font-black text-foreground">{bids.length.toLocaleString('ar-LY')}</strong><span className="text-xs text-foreground/50">مزايدة مسجلة</span></div><div className="flex items-center gap-2 text-xs text-foreground/55"><ShieldCheck size={18} className="text-primary" /> مزادات محلية داخل ليبيا</div>
              </div>
            </div>
            <div className="hidden justify-self-end lg:block">
              <div className="w-[330px] rounded-2xl border border-foreground/15 bg-[#151a17]/80 p-5 shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold text-primary"><span className="h-2 w-2 rounded-full bg-primary" /> مزادات مباشرة</span><span className="text-xs text-foreground/45">تحديث كل 15 ثانية</span></div>
                <div className="my-5 h-px bg-foreground/10" />
                <div className="space-y-4">{cars.slice(0, 3).map((car) => <button onClick={() => setSelected(car)} key={car.id} className="flex w-full items-center gap-3 text-right transition hover:translate-x-[-3px]"><img src={car.imageUrl} alt={car.title} className="h-14 w-16 rounded-xl object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-foreground">{car.title}</span><span className="mt-1 block text-xs text-foreground/50">أعلى مزايدة</span></span><span className="whitespace-nowrap text-xs font-bold text-primary">{formatMoney(priceFor(car))} د.ل</span></button>)}</div>
                <a href="#auctions" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-foreground/5 py-3 text-xs font-bold text-foreground/75 transition hover:bg-foreground/10">شاهد كل السيارات <ArrowUpLeft size={15} /></a>
              </div>
            </div>
          </div>
        </section>

        <section id="auctions" className="mx-auto max-w-[1440px] px-4 py-14 sm:px-8 sm:py-20">
          <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-primary"><span className="h-px w-8 bg-primary" /> اختيارات ايكو</div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">سيارات في المزاد</h2><p className="mt-2 text-sm text-muted-foreground">اختر سيارتك المفضلة وكن صاحب أعلى مزايدة.</p></div>
            <div className="flex flex-col gap-3 sm:flex-row"><label className="flex h-12 items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[.03] px-4 sm:w-[300px]"><Search size={17} className="shrink-0 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن سيارة أو مدينة..." className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label><label className="flex h-12 items-center gap-2 rounded-xl border border-foreground/10 px-4 text-sm font-semibold text-muted-foreground"><SlidersHorizontal size={16} /><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className="bg-transparent outline-none"><option value="newest">الأحدث أولاً</option><option value="price">أعلى سعر بداية</option><option value="ending">الأقرب لانتهاء المزاد</option></select><ChevronDown size={15} /></label></div>
          </div>
          <div className="mb-7 flex gap-2 overflow-x-auto pb-2">{['الكل', 'سيدان', 'SUV', 'بيك أب'].map((item) => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition ${category === item ? 'bg-primary text-primary-foreground' : 'border border-foreground/10 text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}>{item}</button>)}</div>
          {loading ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((n) => <div key={n} className="h-[360px] animate-pulse rounded-2xl border border-foreground/10 bg-foreground/[.03]" />)}</div> : visibleCars.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{visibleCars.map((car) => <VehicleCard key={car.id} car={car} price={priceFor(car)} bidCount={bidCountFor(car)} onClick={() => setSelected(car)} />)}</div> : <div className="rounded-2xl border border-dashed border-foreground/15 px-6 py-16 text-center"><CarFront className="mx-auto mb-4 text-primary" size={34} /><h3 className="text-lg font-bold">لا توجد سيارات مطابقة</h3><p className="mt-2 text-sm text-muted-foreground">جرّب البحث بكلمات أخرى أو اختر تصنيفاً مختلفاً.</p></div>}
          {isAdmin && <button onClick={() => setShowAdd(true)} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 py-4 font-bold text-primary transition hover:bg-primary/5 sm:hidden"><Plus size={18} /> أضف سيارة للمزاد</button>}
        </section>

        <section id="how" className="border-y border-foreground/5 bg-foreground/[.025]">
          <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-8 sm:py-16"><div className="mb-8 text-center"><span className="text-xs font-bold tracking-[.18em] text-primary">بكل بساطة</span><h2 className="mt-3 text-3xl font-black">كيف تزايد؟</h2></div><div className="grid gap-4 md:grid-cols-3">{[{n:'01',title:'اختر سيارتك',desc:'تصفح المواصفات والصور وموقع السيارة قبل الدخول في المزاد.',icon:Search},{n:'02',title:'قدّم مزايدتك',desc:'سجّل دخولك وقدم مزايدة أعلى من السعر الحالي بخطوات بسيطة.',icon:Gavel},{n:'03',title:'تابع النتيجة',desc:'تابع تحديث السعر حتى نهاية المزاد وتواصل مع المعرض لإتمام المعاينة.',icon:BadgeCheck}].map(({n,title,desc,icon:Icon}) => <div key={n} className="rounded-2xl border border-foreground/10 bg-background/70 p-6 transition hover:-translate-y-1 hover:border-primary/30"><div className="mb-5 flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={20} /></span><span className="font-mono text-sm font-bold text-foreground/25">{n}</span></div><h3 className="text-lg font-extrabold">{title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{desc}</p></div>)}</div></div>
        </section>
        <footer id="contact" className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>© 2026 معرض ايكو للسيارات · ليبيا</span><span className="flex items-center gap-2"><MapPin size={14} className="text-primary" /> طرابلس، ليبيا <span className="mx-1 text-foreground/20">|</span> السبت – الخميس</span><span className="font-bold text-foreground">هاتف المعرض: يضاف عند استلام الرقم</span></footer>
      </main>

      {selected && <CarDialog car={selected} currentPrice={priceFor(selected)} bidCount={bidCountFor(selected)} bids={bids.filter((bid) => bid.carId === selected.id).slice(0, 4)} isAdmin={isAdmin} user={user} onClose={() => setSelected(null)} onBid={(amount) => placeBid(selected, amount)} onDelete={() => removeCar(selected)} onSignIn={signIn} />}
      {showAdd && isAdmin && <AddCarDialog onClose={() => setShowAdd(false)} onSubmit={addCar} />}
    </div>
  )
}

function VehicleCard({ car, price, bidCount, onClick }: { car: AuctionCarsRow; price: number; bidCount: number; onClick: () => void }) {
  return <article className="group overflow-hidden rounded-2xl border border-foreground/10 bg-[#1c231f] transition duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-xl hover:shadow-black/20">
    <button onClick={onClick} className="relative block aspect-[16/10] w-full overflow-hidden text-right"><img src={car.imageUrl} alt={car.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /><span className="absolute right-4 top-4 rounded-full border border-primary/25 bg-[#111813]/85 px-3 py-1.5 text-[11px] font-bold text-primary backdrop-blur">{car.description.includes('بيانات تجريبية') ? 'عرض تجريبي' : isAuctionEnded(car.auctionEndsAt) ? 'انتهى المزاد' : 'مزاد نشط'}</span><span className="absolute bottom-3 left-3 rounded-lg bg-[#111813]/80 px-2.5 py-1.5 text-[10px] font-semibold text-foreground/80 backdrop-blur"><Clock3 className="ml-1 inline h-3 w-3" />{remaining(car.auctionEndsAt)}</span><span className="absolute inset-0 bg-gradient-to-t from-[#111813]/55 to-transparent" /></button>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold leading-snug">{car.title}</h3><p className="mt-1 text-xs text-muted-foreground">{car.year} <span className="mx-1 text-foreground/20">·</span> {car.make}</p></div></div>
      <div className="mt-5 grid grid-cols-3 gap-2 border-y border-foreground/8 py-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Gauge size={14} className="text-primary" />{Number(car.mileage).toLocaleString('ar-LY')} كم</span><span className="flex items-center gap-1.5"><ArrowDownUp size={14} className="text-primary" />{car.transmission}</span><span className="flex items-center gap-1.5"><Fuel size={14} className="text-primary" />{car.fuel}</span></div>
      <div className="flex items-end justify-between gap-2 pt-4"><div><span className="block text-[11px] text-muted-foreground">أعلى مزايدة حالية</span><strong className="mt-1 block text-xl font-black text-primary">{formatMoney(price)} <small className="text-xs font-bold">د.ل</small></strong></div><span className="mb-1 text-xs text-muted-foreground"><Gavel size={13} className="ml-1 inline" />{bidCount.toLocaleString('ar-LY')} مزايدة</span></div>
      <button onClick={onClick} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-extrabold text-primary-foreground transition hover:brightness-110 active:scale-[.98]">{isAuctionEnded(car.auctionEndsAt) ? 'عرض التفاصيل' : 'زايد الآن'} <ArrowLeft size={16} /></button>
    </div>
  </article>
}

function CarDialog({ car, currentPrice, bidCount, bids, isAdmin, user, onClose, onBid, onDelete, onSignIn }: { car: AuctionCarsRow; currentPrice: number; bidCount: number; bids: AuctionBidsRow[]; isAdmin: boolean; user: NonNullable<Awaited<ReturnType<typeof blink.auth.me>>> | null; onClose: () => void; onBid: (amount: number) => void; onDelete: () => void; onSignIn: () => void }) {
  const [amount, setAmount] = useState(currentPrice + 500)
  const facts = [
    { label: 'المسافة', value: `${Number(car.mileage).toLocaleString('ar-LY')} كم`, Icon: Gauge },
    { label: 'ناقل الحركة', value: car.transmission, Icon: ArrowDownUp },
    { label: 'الوقود', value: car.fuel, Icon: Fuel },
    { label: 'الحالة', value: car.condition, Icon: Check },
  ]
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="car-dialog-title" onClick={(event) => event.stopPropagation()} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-foreground/10 bg-[#171e19] shadow-2xl sm:rounded-3xl"><div className="grid md:grid-cols-[1.1fr_.9fr]"><div className="relative min-h-[260px] md:min-h-[540px]"><img src={car.imageUrl} alt={car.title} className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#171e19] via-[#171e19]/5 to-black/25 md:bg-gradient-to-l md:from-[#171e19]/20 md:via-transparent md:to-transparent" /><button onClick={onClose} className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-foreground backdrop-blur" aria-label="إغلاق"><X size={19} /></button></div>
    <div className="p-6 sm:p-8"><div className="flex items-center gap-2 text-xs font-bold text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> {isAuctionEnded(car.auctionEndsAt) ? 'انتهى المزاد' : 'مزاد نشط'} <span className="mr-auto rounded-full bg-primary/10 px-3 py-1 text-primary">{remaining(car.auctionEndsAt)}</span></div><h2 id="car-dialog-title" className="mt-3 text-2xl font-black">{car.title}</h2><p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={15} className="text-primary" /> {car.location} <span className="mx-1">·</span> {car.year}</p><p className="mt-5 text-sm leading-7 text-foreground/65">{car.description}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">{facts.map(({ label, value, Icon }) => <div key={label} className="rounded-xl border border-foreground/8 bg-foreground/[.025] p-3"><span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon size={13} className="text-primary" />{label}</span><strong className="mt-1 block text-sm">{value}</strong></div>)}</div>
      <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/[.06] p-4"><span className="text-xs text-muted-foreground">أعلى مزايدة حالية · {bidCount.toLocaleString('ar-LY')} مزايدة</span><strong className="mt-1 block text-3xl font-black text-primary">{formatMoney(currentPrice)} <small className="text-sm">د.ل</small></strong></div>
      <div className="mt-4 flex gap-2"><input aria-label="قيمة المزايدة بالدينار الليبي" type="number" min={currentPrice + 500} step="500" value={amount} onChange={(event) => setAmount(Number(event.target.value))} disabled={isAuctionEnded(car.auctionEndsAt)} className="min-w-0 flex-1 rounded-xl border border-foreground/10 bg-foreground/[.04] px-4 py-3 font-bold outline-none focus:border-primary disabled:opacity-50" /><button disabled={isAuctionEnded(car.auctionEndsAt)} onClick={() => user ? onBid(amount) : onSignIn()} className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-3 font-extrabold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><Gavel size={17} />{isAuctionEnded(car.auctionEndsAt) ? 'انتهى المزاد' : 'زايد الآن'}</button></div>{!isAuctionEnded(car.auctionEndsAt) && <p className="mt-2 text-[11px] text-muted-foreground">الحد الأدنى للمزايدة التالية: {formatMoney(currentPrice + 500)} د.ل</p>}
      <div className="mt-6 border-t border-foreground/10 pt-4"><h3 className="mb-3 text-sm font-bold">آخر المزايدات</h3>{bids.length ? <div className="space-y-2">{bids.map((bid) => <div key={bid.id} className="flex justify-between text-xs"><span className="text-muted-foreground">{bid.userId === user?.id ? 'مزايدتك' : 'مزايد مسجل'}</span><span className="font-bold text-primary">{formatMoney(Number(bid.amount))} د.ل</span></div>)}</div> : <p className="text-xs text-muted-foreground">كن أول من يزايد على هذه السيارة.</p>}</div>
      {isAdmin && <button onClick={onDelete} className="mt-5 rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-400/10">حذف الإعلان</button>}
    </div></div></section></div>
}

function AddCarDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={onClose}><form onSubmit={onSubmit} onClick={(event) => event.stopPropagation()} className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-foreground/10 bg-[#171e19] p-6 shadow-2xl sm:rounded-3xl sm:p-8"><div className="mb-6 flex items-center justify-between"><div><span className="text-xs font-bold text-primary">لوحة الإدارة</span><h2 className="mt-1 text-2xl font-black">إضافة سيارة للمزاد</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-foreground/10" aria-label="إغلاق"><X size={18} /></button></div>
    <div className="grid gap-4 sm:grid-cols-2">{[{name:'title',label:'عنوان الإعلان',placeholder:'مثال: تويوتا كامري GLI',type:'text'},{name:'make',label:'الشركة المصنعة',placeholder:'Toyota',type:'text'},{name:'model',label:'الموديل',placeholder:'Camry',type:'text'},{name:'year',label:'سنة الصنع',placeholder:'2021',type:'number'},{name:'mileage',label:'المسافة (كم)',placeholder:'42000',type:'number'},{name:'startingBid',label:'سعر بداية المزاد (د.ل)',placeholder:'75000',type:'number'},{name:'location',label:'المدينة',placeholder:'طرابلس',type:'text'},{name:'imageUrl',label:'رابط صورة السيارة',placeholder:'https://...',type:'url'}].map((field) => <label key={field.name} className="space-y-1.5 text-xs font-semibold text-foreground/65">{field.label}<input name={field.name} type={field.type} placeholder={field.placeholder} required className="w-full rounded-xl border border-foreground/10 bg-foreground/[.04] px-3 py-3 text-sm text-foreground outline-none placeholder:text-foreground/25 focus:border-primary" /></label>)}
    <label className="space-y-1.5 text-xs font-semibold text-foreground/65">ناقل الحركة<select name="transmission" className="w-full rounded-xl border border-foreground/10 bg-[#202923] px-3 py-3 text-sm text-foreground"><option>أوتوماتيك</option><option>يدوي</option></select></label><label className="space-y-1.5 text-xs font-semibold text-foreground/65">الوقود<select name="fuel" className="w-full rounded-xl border border-foreground/10 bg-[#202923] px-3 py-3 text-sm text-foreground"><option>بنزين</option><option>ديزل</option><option>هجين</option><option>كهرباء</option></select></label><label className="space-y-1.5 text-xs font-semibold text-foreground/65">الحالة<select name="condition" className="w-full rounded-xl border border-foreground/10 bg-[#202923] px-3 py-3 text-sm text-foreground"><option>ممتازة</option><option>جيدة جداً</option><option>جيدة</option><option>تحتاج فحصاً</option></select></label><label className="space-y-1.5 text-xs font-semibold text-foreground/65">مدة المزاد بالأيام<input name="days" type="number" min="1" max="30" defaultValue="3" required className="w-full rounded-xl border border-foreground/10 bg-foreground/[.04] px-3 py-3 text-sm text-foreground outline-none focus:border-primary" /></label><label className="space-y-1.5 text-xs font-semibold text-foreground/65 sm:col-span-2">وصف السيارة<textarea name="description" rows={3} required placeholder="اذكر حالة السيارة وأهم المواصفات..." className="w-full resize-y rounded-xl border border-foreground/10 bg-foreground/[.04] px-3 py-3 text-sm text-foreground outline-none placeholder:text-foreground/25 focus:border-primary" /></label></div>
    <div className="mt-6 flex gap-3"><button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-extrabold text-primary-foreground transition hover:brightness-110"><Plus size={18} />نشر السيارة</button><button type="button" onClick={onClose} className="rounded-xl border border-foreground/10 px-5 font-bold text-muted-foreground">إلغاء</button></div>
  </form></div>
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-LY', { maximumFractionDigits: 0 }).format(value)
}

function remaining(value: string) {
  const date = new Date(value.includes('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`)
  const ms = date.getTime() - Date.now()
  if (ms <= 0) return 'انتهى المزاد'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  return days ? `${days} يوم متبقٍ` : `${hours} ساعة متبقية`
}

function isAuctionEnded(value: string) {
  const date = new Date(value.includes('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`)
  return date.getTime() <= Date.now()
}
