const supportOptions = [
  {
    title: "Email support",
    detail: "Reach us at support@equityflow.io",
    href: "mailto:support@equityflow.io",
  },
  {
    title: "Call our desk",
    detail: "Mon–Fri • 8:00 AM to 8:00 PM",
    href: "tel:+910000000000",
  },
  {
    title: "Live chat",
    detail: "Start a conversation with our onboarding specialists",
    href: "#",
  },
];

const CreateTicket = () => (
  <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8 mt-10">
    <div className="space-y-6">
      <div className="mx-auto w-full max-w-4xl rounded-4xl border border-slate-200 bg-slate-50 p-6 shadow-sm sm:p-8 lg:p-10 mb-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            Ask us anything
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Share your question, and our team will help you with account
            opening, platform access, or anything else you need.
          </p>
        </div>

        <form className="mt-8 flex flex-col items-center space-y-4">
          <label className="block w-full max-w-lg text-sm font-medium text-slate-700">
            <span className="mb-2 block">How can we help?</span>
            <textarea
              rows="4"
              placeholder="Type your question here..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <button
            type="submit"
            className="rounded-full bg-blue-400 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            Submit question
          </button>
        </form>
      </div>

      <div className="rounded-4xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10 lg:p-12">
        <h3 className="text-xl font-semibold text-slate-900">
          Other ways to reach us
        </h3>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {supportOptions.map((option) => (
            <a
              key={option.title}
              href={option.href}
              className="rounded-[1.25rem] border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <p className="font-medium text-slate-800">{option.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {option.detail}
              </p>
            </a>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default CreateTicket;
