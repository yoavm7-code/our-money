import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { DocumentsModule } from './documents/documents.module';
import { RulesModule } from './rules/rules.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { InsightsModule } from './insights/insights.module';
import { LoansModule } from './loans/loans.module';
import { SavingsModule } from './savings/savings.module';
import { TwoFactorModule } from './two-factor/two-factor.module';
import { ForexModule } from './forex/forex.module';
import { GoalsModule } from './goals/goals.module';
import { RecurringModule } from './recurring/recurring.module';
import { BudgetsModule } from './budgets/budgets.module';
import { StocksModule } from './stocks/stocks.module';
import { AlertsModule } from './alerts/alerts.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TaxModule } from './tax/tax.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting: 60 requests per minute by default
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),

    // Core infrastructure
    PrismaModule,
    EmailModule,

    // Authentication & users
    AuthModule,
    UsersModule,
    TwoFactorModule,

    // Financial core
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,

    // Documents & rules
    DocumentsModule,
    RulesModule,

    // Freelancer business modules
    ClientsModule,
    ProjectsModule,
    InvoicesModule,
    TaxModule,

    // Analytics & reporting
    DashboardModule,
    InsightsModule,
    ReportsModule,

    // Financial products
    LoansModule,
    SavingsModule,
    GoalsModule,
    RecurringModule,
    ForexModule,
    StocksModule,

    // Notifications & admin
    AlertsModule,
    AdminModule,
  ],
  providers: [],
})
export class AppModule {}
