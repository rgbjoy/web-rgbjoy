import { getServerSideURL } from '@/utilities/getURL'

export const ViewSite = () => {
  return (
    <div className="view-site-wrapper">
      <a
        href={`${getServerSideURL()}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          marginBottom: '10px',
          padding: '10px',
          border: '1px solid white',
          color: 'white',
          textDecoration: 'none',
        }}
      >
        Visit Site
      </a>
    </div>
  )
}
