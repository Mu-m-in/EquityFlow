const StatsItem = ({ title, description }) => (
  <article className="space-y-3">
    <h3 className="text-[1.35rem] font-medium text-[#424242]">{title}</h3>
    <p className="text-base leading-8 text-[#666]">{description}</p>
  </article>
)

export default StatsItem
