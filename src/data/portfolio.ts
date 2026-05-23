export const portfolioItems = [
  {
    title: "2025 Portfolio Operations Hackathon",
    type: "AI Hackathon",
    period: "Spring 2025",
    date: "2025-05-31",
    summary:
      "Team UserLens built a winning proof of concept for a personalized technical documentation experience in the Customer Insights category.",
    details: [
      "The live browser demo used a Chrome extension on Cisco documentation pages to pass a user persona to Cisco Bridge IT's LLM service.",
      "The Bridge IT API returned revised content tailored to the persona, such as Sales Engineer, Network Engineer, or Network Architect.",
    ],
    resume: true,
  },
  {
    title: "The Leverett Comprehensive Plan",
    type: "Municipal Planning",
    period: "Summer 2022 - Spring 2025",
    date: "2025-04-20",
    summary:
      "Years-long comprehensive planning work using community-based participatory methods, public deliberation, surveys, mailers, working groups, and policy communication.",
    details: [
      "Supported two year-long grant cycles with public relations, deliberation, survey design, printed outreach, improvised public speaking, and two citizen working groups.",
      "Helped residents distinguish what is obligated by policy from what remains open for local discretion.",
    ],
    links: [
      {
        label: "Town comprehensive planning page",
        url: "https://leverett.ma.us/g/95/Comprehensive-Planning",
      },
      {
        label: "Plan print version PDF",
        url: "/artifacts/leverett-comprehensive-plan-2025-print-version.pdf",
      },
    ],
    resume: true,
  },
  {
    title: "Spring 2023 UMass Quantitative Analysis Project Data Poster",
    type: "Data Poster",
    period: "Spring 2023",
    date: "2023-05-01",
    summary:
      "Final DACSS 603 research project in R using Massachusetts state agency data to examine small-town elementary school effectiveness.",
    details: [
      "Research question: in Massachusetts small town elementary schools, which factors have the strongest association with school effectiveness, and which are subject to local influence?",
    ],
    links: [
      {
        label: "Data poster PDF",
        url: "/artifacts/shores-dacss-603-final-project-data-poster.pdf",
      },
    ],
    resume: false,
  },
  {
    title: "Local Police Department Call Data Analysis",
    type: "Reproducible Research",
    period: "Spring 2023",
    date: "2023-05-20",
    summary:
      "R and Quarto analysis of police call data for two small rural towns before and after a department regionalization agreement.",
    details: [
      "Designed to help town administrators reason about budgeting and resource allocation as policing needs change.",
    ],
    links: [
      {
        label: "Open report",
        url: "https://dacss.github.io/601_Spring_2023/posts/TimShores_FinalProject.html",
      },
    ],
    resume: false,
  },
  {
    title: "Leverett Revenue Committee FY21 Year-end Report",
    type: "Municipal Finance",
    period: "April 2019 - April 2021",
    date: "2021-04-30",
    summary:
      "Annual report on tax rate growth, economic development factors, affordability, and sustainable development recommendations.",
    details: [
      "Served as committee co-chair, primary data analyst, and writer.",
    ],
    links: [
      {
        label: "Year-end report PDF",
        url: "/artifacts/leverett-revenue-committee-fy21-year-end-report.pdf",
      },
    ],
    resume: true,
  },
  {
    title: "Leverett Elders Studies Needs Assessment",
    type: "Community Research",
    period: "February 2022 - January 2023",
    date: "2023-01-01",
    summary:
      "Community-based participatory needs assessment with the Leverett Council on Aging focused on assets and needs experienced by residents age 50+.",
    details: [
      "Collaborated with Jya Plavin to parse signal from noise in community input and help position the Council on Aging to design new programming and win funding.",
      "Centered research as a tool for community power, dialogue, and shared interpretation of evidence.",
    ],
    links: [
      {
        label: "Needs assessment PDF",
        url: "/artifacts/leverett-elders-needs-assessment-2023.pdf",
      },
    ],
    resume: true,
  },
  {
    title: "Western MA Per Pupil Expenditure Report",
    type: "School Committee",
    period: "Summer 2025 - Spring 2026",
    date: "2026-05-31",
    summary:
      "Work as the Leverett member of the Amherst-Pelham Regional School Committee examining per-pupil expenditure patterns across Western Massachusetts school districts by enrollment-based cohorts.",
    details: [
      "Frames PPE as a flawed lens for understanding school budgets, but one that can still be useful when its limits are made clear in public budget deliberations.",
    ],
    links: [
      {
        label: "Full report PDF",
        url: "/artifacts/western-ma-ppe-report.pdf",
      },
      {
        label: "Executive summary PDF",
        url: "/artifacts/western-ma-ppe-report-executive-summary.pdf",
      },
      {
        label: "Appendices PDF",
        url: "/artifacts/western-ma-ppe-appendices.pdf",
      },
      {
        label: "GitHub source",
        url: "https://github.com/timshores/schools/blob/main/ppe_report/output/Western%20MA%20Per%20Pupil%20Expenditure%20Report.pdf",
      },
    ],
    resume: true,
  },
  {
    title: "Cisco Documentation Sampler",
    type: "Technical Documentation",
    period: "2024-2026",
    date: "2026-05-01",
    summary:
      "Selected Cisco documentation samples for SASE management, security insights, and network tunnel administration.",
    details: [
      "Representative product documentation written for cybersecurity administrators and technical users.",
    ],
    links: [
      {
        label: "Cisco SASE Management Administration Guide",
        url: "https://securitydocs.cisco.com/docs/sase/olh/161124.dita",
      },
      {
        label: "Security Insights Dashboard",
        url: "https://securitydocs.cisco.com/docs/csa/olh/169797.dita",
      },
      {
        label: "Manage Network Tunnel Groups",
        url: "https://securitydocs.cisco.com/docs/csa/olh/118900.dita",
      },
    ],
    resume: false,
  },
] as const;
